import { graphql } from '@octokit/graphql';
import { Octokit } from '@octokit/rest';

import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';

import figlet from 'figlet';

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

function isGHASEnabled(repo: any, category: string) : boolean {
  const ghas = repo['security_and_analysis'][category];
  if (ghas !== undefined && ghas['status'] === 'enabled') {
    return true;
  }
  return false;
}

async function isDependabotEnabled(owner: string, repo: string, auth: string) : Promise<any> {
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

/*  //not needed if above block works//

async function areDependabotAlertsEnabled(owner: string, repo: string) : Promise<any> {
  try{
    const response = (await octokit.rest.repos.checkVulnerabilityAlerts({owner,repo}));
    if (response.status == 204){
      return true;
    }
  }catch(error){
    return false;
  }
}
*/
/*  meant to check if dependabot.yml file exists in repo, still need to impliment the check

async function areDependabotVersionUpdatesEnabled(owner: string, repo: string) : Promise<any> {
  const response  = await graphql({
    query: `
    {
      repository(name: "${repo}", owner: "${owner}") {
          object(expression: "HEAD:.github/") {
              ... on Tree {
                  entries {
                      name
                  }
              }
          }
      }
    }`,
    headers: {
      authorization: `token ${args.authToken}`,
    },
  });

  console.log(JSON.stringify(response,null,2));
  console.log(response['repository']['object']);
  if(response['repository']['object'] == null){
    return false;
  //TODO: check if entries array contains "name": "dependabot.yml"
  }else if (response['repository']['object']['entries']){
    return true;
  }
}
*/
async function getRepoStats(owner: string) {
  const repos = await octokit.paginate("GET /orgs/{org}/repos", {
    org: owner
  });
  
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
      ['languages', await listRepositoryLanguages(args.organization, repo.name)],
      ['teams', await listRepositoryTeams(args.organization, repo.name)],
      ['ci', await listCI(args.organization, repo.name)],
      ['advanced_security_enabled', isGHASEnabled(repo, 'advanced_security')],
      ['dependabot_alerts_enabled', await isDependabotEnabled(args.organization, repo.name, args.authToken.toString())],
      ['secret_scanning_enabled', isGHASEnabled(repo, 'secret_scanning')],
      ['push_protection_enabled', isGHASEnabled(repo, 'secret_scanning_push_protection')]
    ]));
  }));

  return stats;
}

console.log(figlet.textSync("Ghost"));

const prettyargs = yargs(hideBin(process.argv));
const args = prettyargs
    .wrap(prettyargs.terminalWidth())
    .scriptName('ghost')
    .usage('$0 [options] <organization>', 'Gather intel about GitHub organizations')
    .positional('organization', {
      describe: 'GitHub organization to scan',
      type: 'string'
    })
    .help('help', 'Show options for this tool')
    .option('e', {
      default: 'https://api.github.com',
      describe: 'GitHub API endpoint',
      type: 'string',
      alias: 'github-url'
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

// const orgs = await octokit.paginate("GET /organizations", {
//     per_page: 100
//   });

console.log(await getRepoStats(args.organization));
