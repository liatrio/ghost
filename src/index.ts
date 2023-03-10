import { graphql } from '@octokit/graphql';
import { Octokit } from '@octokit/rest';

import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';

import figlet from 'figlet';
import Handlebars from 'handlebars';

import { createArrayCsvWriter } from 'csv-writer';

async function listRepositoryLanguages(owner: string, repo: string) : Promise<any> {
  const languages = (await octokit.rest.repos.listLanguages({owner, repo})).data;
  let stats = new Map<string, number>();
  let bytes = 0
  for(const [_, value] of Object.entries(languages)) {
    bytes += value;
  }
  for(const [key, value] of Object.entries(languages)) {
    let percent = Math.round(((value / bytes * 100) + Number.EPSILON) * 100) / 100;
    stats.set(key, percent);
  }
  return stats;
}

async function listRepositoryTeams(owner: string, repo: string) : Promise<any> {
  const teams = (await octokit.rest.repos.listTeams({owner, repo})).data;
  let names = [];
  teams.forEach(team => {
    names.push(team.name);
  });
  return names;
}

async function listCI(owner: string, repo: string) : Promise<any> {
  const files = {
    'CircleCI': '.circleci/config.yml',
    'GitHub Actions': '.github/workflows',
    'GitLab CI': '.gitlab-ci.yml',
    'Travis CI': '.travis.yml',
    'Azure Pipelines': 'azure-pipelines.yml',
    'AWS CodeBuild': 'buildspec.yml',
    'Jenkins': 'Jenkinsfile'
  };
  let ci = [];
  for(const [key, outerValue] of Object.entries(files)) {
    const path = outerValue.split('/');
    const filename = path.pop();
    const dir = path.join('/');
    (await octokit.rest.repos.getContent({owner, repo, path: dir})
      .then(response => {
        let contents = response.data;
        for(const [_, innerValue] of Object.entries(contents)) {
          if(innerValue.name === filename) {
            ci.push(key);
          }
        }
      })
      .catch(error => { 
        // pass, at least until we implement debug logging
      })
    );
  };
  return ci;
}

function isGHASEnabled(repo: any, category: string) : string {
  const ghas = repo['security_and_analysis'];
  if(ghas !== undefined && ghas.hasOwnProperty(category)) {
    return ghas[category];
  }
  return 'unknown';
}

async function isDependabotEnabled(owner: string, repo: string, auth: string) : Promise<any> {
  // TODO: build this out to get accurate status of Dependabot - I have no idea what this is actually checking against
	var query = `{
		repository(name: "${repo}", owner: "${owner}") {
			hasVulnerabilityAlertsEnabled
		}
	}`;
	const result = await graphql(query, {
    headers: {
      authorization: `token ${auth}`
    }
  });
  return result['repository']['hasVulnerabilityAlertsEnabled'];
}

async function getRepoStats(owner: string, repo?: string) {
  let repos = [];
  if(repo === undefined) {
    repos = await octokit.paginate("GET /orgs/{owner}/repos", {
      owner: owner
    });
  } else {
    repos = await octokit.paginate("GET /repos/{owner}/{repo}", {
      owner: owner,
      repo: repo
    });
  }
  const stats = new Map<string, Map<string, any>>();
  await Promise.all(repos.map(async repo => {
    stats.set(repo.name, new Map<string, any>([
      ['visibility', repo.visibility],
      ['default_branch', repo.default_branch],
      ['license', repo.license? repo.license.name : ''],
      ['is_fork', repo.fork],
      ['forks', repo.forks],
      ['archived', repo.archived],
      ['primary_language', repo.language],
      ['languages', await listRepositoryLanguages(owner, repo.name)],
      ['teams', await listRepositoryTeams(owner, repo.name)],
      ['ci', await listCI(owner, repo.name)],
      ['advanced_security', isGHASEnabled(repo, 'advanced_security')],
      // ['dependabot_alerts_enabled', await isDependabotEnabled(owner, repo.name, args.authToken.toString())],
      ['secret_scanning', isGHASEnabled(repo, 'secret_scanning')],
      ['push_protection', isGHASEnabled(repo, 'secret_scanning_push_protection')]
    ]));
  }));

  await writeToCSV(stats);
  return stats;
}

const githubPublicUrl = 'https://api.github.com';

console.log(figlet.textSync("Ghost"));

const prettyargs = yargs(hideBin(process.argv));
const args = prettyargs
    .wrap(prettyargs.terminalWidth())
    .scriptName('ghost')
    .usage('$0 [options]', 'Gather intel about GitHub organizations')
    .help('help', 'Show options for this tool')
    .option('e', {
      default: githubPublicUrl,
      describe: 'GitHub API endpoint',
      type: 'string',
      alias: 'github-url'
    })
    .option('o', {
      describe: 'GitHub organization',
      type: 'string',
      alias: 'organization'
    })
    .option('r', {
      describe: 'GitHub repository',
      type: 'string',
      alias: 'repository'
    })
    .option('t', {
      describe: 'GitHub Apps token or PAT',
      type: 'string',
      alias: 'auth-token'
    })
    .parseSync();

const octokit = new Octokit({
  auth: args.authToken,
  baseUrl: args.githubUrl.toString()
});

let countOrgs = 0;
let stats = {};
if(args.organization === undefined && args.githubUrl !== githubPublicUrl) {
  await octokit.paginate("GET /organizations", {
    per_page: 100
  },
  (response) => response.data.map(async org => {
    console.log(org.login)
    countOrgs++;
    stats = await getRepoStats(org.login);
  }));
} else if(args.organization === undefined) {
  console.log('When using the public GitHub API, you must specify an organization.');
  process.exit(1);
} else {
  countOrgs = 1;
  if(args.repository === undefined) {
    stats = await getRepoStats(args.organization.toString());
  } else {
    stats = await getRepoStats(args.organization.toString(), args.repository.toString());
  }
}

// TODO: write stats to CSV scoping to orgs and improvement on data output
async function writeToCSV(stats: Map<string, Map<string, any>>) {
  const createCsvWriter = await createArrayCsvWriter;
  let statkeys = [ "repository" ];
  let data = []
  statkeys = statkeys.concat(Array.from(Array.from(stats.values())[0].keys()));
  for(let repository of Array.from(stats.keys())){
    let statvalues = [];
    statvalues.push(repository);
    let repo_stats = stats.get(repository);
    for(let key of Array.from( repo_stats.keys() )) {
      let value = repo_stats.get(key);
      if (typeof value === "object"){
        if (value === undefined || value === null) {
          statvalues.push(String(value));
        }
        else if (value instanceof Map){
          let lang_array = []
          for(let key of Array.from( value.keys() )) {
            lang_array.push(key + ": " + String(value.get(key)))
          }
          statvalues.push(lang_array);
        }
        else {
          statvalues.push(String(Object.values(value)));
        }
      }
      else {
        statvalues.push(value);
      }
    }
    data.push(statvalues);
  }
  const csvWriter = createCsvWriter({
    path: 'github_data.csv',
    header: statkeys
  });

  csvWriter.writeRecords(data).then(()=> console.log('The CSV file was written successfully'));
}

console.log(`Organizations processed: ${countOrgs}`);


