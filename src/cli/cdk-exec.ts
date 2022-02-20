#!/usr/bin/env node
import * as cxapi from 'aws-cdk-lib/cx-api';
import chalk from 'chalk';
import * as yargs from 'yargs';
import { AwsSdk } from '../aws-sdk';
import { Executor } from '../executor';
import { MetadataMatch } from '../find-matching-resources';

async function main(): Promise<number> {
  const args: any = yargs
    .usage('$0 [path]', 'Execute the resource for a construct at a given path', builder => builder
      .positional('path', {
        type: 'string',
        description: 'Path to executable construct resource',
      })
      .option('app', {
        type: 'string',
        alias: 'a',
        default: process.env.CDK_APP ?? 'cdk.out',
        description: 'Path to your `cdk.out` cloud assembly directory',
      })
      .option('all', {
        type: 'boolean',
        description: 'Execute all matching resources',
      })
      .option('metadata', {
        type: 'array',
        alias: 'm',
        description: 'Match resources with the given metadata key or key=value',
      })
      .option('input', {
        type: 'string',
        description: 'Execute with custom JSON input',
      }))
    .argv;

  // TODO: Need a better way to handle config-based profiles.
  process.env.AWS_SDK_LOAD_CONFIG = '1';

  return cdkExec({
    constructPath: args.path,
    app: args.app,
    all: args.all,
    metadata: args.metadata ? new MetadataMatch(args.metadata) : undefined,
    input: args.input,
  });
}

export interface CdkExecOptions {
  /**
   * App directory.
   */
  readonly app: string;

  /**
   * Execute all matches rather than erroring on ambiguity
   */
  readonly all: string;

  /**
   * Path of the construct to execute.
   */
  readonly constructPath?: string;

  /**
   * Match records with the given metadata
   */
  readonly metadata?: MetadataMatch;

  /**
   * Execution input.
   */
  readonly input?: string;
}

export async function cdkExec(options: CdkExecOptions): Promise<number> {
  try {
    const assembly = new cxapi.CloudAssembly(options.app);

    const executors = await Executor.find({
      assembly,
      constructPath: options.constructPath,
      metadata: options.metadata,
      sdk: new AwsSdk(),
    });

    if (executors.length === 0) {
      console.log('❌  No matching executable constructs found');
      return 1;
    }

    if (!options.all && executors.length > 1) {
      console.log('\n❌  Matched multiple resources: %s', executors.map(e => e.constructPath).join(', '));
      return 1;
    }

    const executorResults = await Promise.all(
      executors.map(async (executor) => {
        console.log('⚡  Executing %s (%s)', executor.constructPath, executor.physicalResourceId);
        const result = await executor.execute(options.input);
        return {
          executor,
          ...result,
        };
      }),
    );

    let error = false;
    for (const result of executorResults) {
      console.log('\n\n✨  Final status of %s', result.executor.constructPath);
      if (result.output) {
        console.log('\nOutput:\n%s', chalk.cyan(JSON.stringify(result.output, null, 2)));
      }

      if (result.error) {
        error = true;
        console.log('\n❌  Execution failed: %s', result.error);
      } else {
        console.log('\n✅  Execution succeeded');
      }
    }

    return error ? 1 : 0;
  } catch (e) {
    if (e instanceof Error) {
      if (e.stack && /new CloudAssembly/.test(e.stack)) {
        console.log('\n❌  AWS CDK lib error: %s', e.message);
        return 1;
      }
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
