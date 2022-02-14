import * as yargs from 'yargs';
import { cliExec } from './cli-exec';

function parseCommandLineArguments() {
  return yargs
    .usage('Usage: cdk-exec -a <cdk-app> COMMAND')
    .option('app', { type: 'string', alias: 'a', default: 'cdk.out' })
    .command('exec <PATH>', 'Executes a supported resource at the given construct path', optYargs => optYargs
      .options('input', {
        type: 'string',
        desc: 'Execute with custom JSON input',
      }),
    )
    .argv;
}

async function main(args: any): Promise<number> {
  process.env.AWS_SDK_LOAD_CONFIG = '1';

  const cmd = args._[0];

  switch (cmd) {
    case 'exec':
      return cliExec({
        constructPath: args.PATH,
        app: args.app,
        input: args.input,
      });
  }

  return 1;
}

main(parseCommandLineArguments())
  .then(exitCode => {
    process.exit(exitCode);
  })
  .catch(e => {
    console.error(e);
    process.exit(1);
  });