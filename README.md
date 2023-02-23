# ghost

## Building the dev environment
```
cd ghost
docker build -t ghost .
```

## Running the dev environment
`docker run -dit --name ghost --hostname dev --entrypoint bash --volume $(pwd)/src:/app ghost`

## Compiling and running the program

```
docker exec -it ghost bash
yarn install
yarn tsc
node dist/index.js <org> -t <pat>
```
