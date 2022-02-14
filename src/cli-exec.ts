import * as cxapi from 'aws-cdk-lib/cx-api';
import chalk from 'chalk';
import { AwsSdk } from './aws-sdk';
import { getExecutor } from './executor';

export interface ExecCmdOptions {
  readonly app: string;
  readonly constructPath: string;
  readonly input?: string;
}

export async function cliExec(options: ExecCmdOptions): Promise<number> {
  const assembly = new cxapi.CloudAssembly(options.app);
  const stacks = assembly.stacks;

  const executor = await getExecutor({
    sdk: new AwsSdk(),
    constructPath: options.constructPath,
    stackArtifacts: stacks,
  });

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
}