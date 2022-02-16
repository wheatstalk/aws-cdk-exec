#!/usr/bin/env node
import * as cxapi from 'aws-cdk-lib/cx-api';
import chalk from 'chalk';
import * as yargs from 'yargs';
import { AwsSdk } from '../aws-sdk';
import { AmbiguousPathError, getExecutor } from '../executor';

async function main(): Promise<number> {
  const args: any = yargs
    .usage('$0 [path]', 'Execute the resource for a construct at a given path', builder => builder
      .positional('path', {
        type: 'string',
        description: 'Path to executable construct resource',
      })
      .option('app', { type: 'string', alias: 'a', default: 'cdk.out' })
      .option('input', {
        type: 'string',
        desc: 'Execute with custom JSON input',
      }))
    .argv;

  // TODO: Need a better way to handle config-based profiles.
  process.env.AWS_SDK_LOAD_CONFIG = '1';

  return cdkExec({
    constructPath: args.path,
    app: args.app,
    input: args.input,
  });
}

export interface ExecCmdOptions {
  readonly app: string;
  readonly constructPath: string;
  readonly input?: string;
}

export async function cdkExec(options: ExecCmdOptions): Promise<number> {
  const assembly = new cxapi.CloudAssembly(options.app);

  try {
    const executor = await getExecutor({
      sdk: new AwsSdk(),
      constructPath: options.constructPath,
      assembly,
    });

    if (!executor) {
      console.log('❌  Could not find a construct at the provided path');
      return 1;
    }

    console.log('✨  Executing %s', executor.physicalResourceId);
    const result = await executor.execute(options.input);

    if (result.output) {
      console.log('\nOutput:\n%s', chalk.cyan(JSON.stringify(result.output, null, 2)));
    }

    if (result.error) {
      console.log('\n❌  Execution failed: %s', result.error);
      return 1;
    }

    console.log('\n✅  Execution succeeded');
    return 0;
  } catch (e) {
    if (e instanceof AmbiguousPathError) {
      console.log('\n❌  Matched multiple resources - please be more specific: %s', e.matchingPaths.join(', '));
      return 1;
    }

    throw e;
  }
}

main()
  .then(exitCode => {
    process.exit(exitCode);
  })
  .catch(e => {
    console.error(e);
    process.exit(1);
  });