import * as cxapi from 'aws-cdk-lib/cx-api';
import * as AWS from 'aws-sdk';
import { IAwsSdk, LazyListStackResources } from './aws-sdk';

const STATE_MACHINE_TYPE = 'AWS::StepFunctions::StateMachine';
const LAMBDA_TYPE = 'AWS::Lambda::Function';

export interface GetExecutorOptions {
  /**
   * The Cloud Assembly
   */
  readonly assembly: cxapi.CloudAssembly;

  /**
   * Path to the resource containing the state machine to execute.
   */
  readonly constructPath: string;

  /**
   * SDK access
   */
  readonly sdk: IAwsSdk;
}

/**
 * Gets an executor.
 */
export async function getExecutor(options: GetExecutorOptions): Promise<Executor | undefined> {
  const { assembly, constructPath, sdk } = options;

  const matchingResources = findMatchingResources({
    assembly,
    constructPath,
    types: [
      STATE_MACHINE_TYPE,
      LAMBDA_TYPE,
    ],
  });

  if (matchingResources.length === 0) {
    return;
  }
  if (matchingResources.length > 1) {
    throw new Error(`The provided path is ambiguous and multiple resources: ${matchingResources.map(r => r.constructPath).join(', ')}`);
  }

  const [matchingResource] = matchingResources;
  const listStackResources = new LazyListStackResources(sdk, matchingResource.stackName);
  const stackResource = (await listStackResources.listStackResources())
    .find(sr => sr.LogicalResourceId === matchingResource.logicalId);

  if (!stackResource || !stackResource.PhysicalResourceId) {
    throw new Error(`Could not find the physical resource id for ${constructPath}`);
  }

  switch (stackResource.ResourceType) {
    case STATE_MACHINE_TYPE:
      return new StateMachineExecutor({
        physicalResourceId: stackResource.PhysicalResourceId,
        stepFunctions: sdk.stepFunctions(),
      });

    case LAMBDA_TYPE:
      return new LambdaFunctionExecutor({
        physicalResourceId: stackResource.PhysicalResourceId,
        lambda: sdk.lambda(),
      });

    default:
      throw new Error(`Unsupported resource type ${stackResource.ResourceType}`);
  }
}

interface FindMatchingResourceOptions {
  readonly assembly: cxapi.CloudAssembly;
  readonly constructPath: string;
  readonly types: string[];
}

export interface MatchingResource {
  readonly stackName: string;
  readonly logicalId: string;
  readonly type: string;
  readonly constructPath: string;
}

export function findMatchingResources(options: FindMatchingResourceOptions): MatchingResource[] {
  const { constructPath, types, assembly } = options;

  const matches = Array<MatchingResource>();
  for (const stack of assembly.stacks) {
    const template = stack.template;

    if (typeof template.Resources !== 'object') {
      continue;
    }

    for (const [logicalId, resource] of Object.entries(template.Resources)) {
      if (typeof resource !== 'object' || resource === null) {
        continue;
      }

      const resourceRecord = resource as Record<string, any>;
      if (typeof resourceRecord.Metadata !== 'object') {
        continue;
      }

      const type = resourceRecord.Type as string;
      if (!types.some(t => t === String(type))) {
        continue;
      }

      const resourceConstructPath = resourceRecord.Metadata[cxapi.PATH_METADATA_KEY] as string;
      if (resourceConstructPath === constructPath || resourceConstructPath.startsWith(`${constructPath}/`)) {
        matches.push({
          logicalId,
          type,
          constructPath: resourceConstructPath,
          stackName: stack.stackName,
        });
      }
    }
  }

  return matches;
}

/**
 * Options for `StateMachineExecutor`
 */
export interface ExecutorOptions {
  /**
   * The physical resource of the resource to execute.
   */
  readonly physicalResourceId: string;
}

/**
 * ABC for executors.
 */
export abstract class Executor {
  readonly physicalResourceId: string;

  protected constructor(options: ExecutorOptions) {
    this.physicalResourceId = options.physicalResourceId;
  }

  abstract execute(input?: string): Promise<ExecuteResult>;

  protected validateJsonObjectInput(input: string | undefined) {
    if (input && !isJsonObject(input)) {
      throw new Error('The provided input should be a JSON object');
    }
  }
}

/**
 * The executor's result.
 */
export interface ExecuteResult {
  /**
   * The execution's output.
   */
  readonly output?: any;

  /**
   * Error message
   */
  readonly error?: string;
}

/**
 * Options for `StateMachineExecutor`
 */
export interface StateMachineExecutorOptions extends ExecutorOptions {
  /**
   * The Step Functions SDK
   */
  readonly stepFunctions: AWS.StepFunctions;
}

/**
 * Executes a Step Functions State Machine
 */
export class StateMachineExecutor extends Executor {
  private readonly stepFunctions: AWS.StepFunctions;

  constructor(options: StateMachineExecutorOptions) {
    super(options);
    this.stepFunctions = options.stepFunctions;
  }

  async execute(input?: string): Promise<ExecuteResult> {
    this.validateJsonObjectInput(input);

    const execution = await this.stepFunctions.startExecution({
      stateMachineArn: this.physicalResourceId,
      input,
    }).promise();

    while (true) {
      const description = await this.stepFunctions.describeExecution({
        executionArn: execution.executionArn,
      }).promise();

      const executionStatus = description.status;
      if (executionStatus == 'RUNNING') {
        await new Promise(res => setTimeout(res, 500));
        continue;
      }

      if (executionStatus === 'SUCCEEDED') {
        const output = description.output
          ? JSON.parse(description.output)
          : undefined;

        return {
          output,
        };
      }

      return {
        error: `State machine execution's final status is ${executionStatus}`,
      };
    }
  }
}

export interface LambdaFunctionExecutorOptions extends ExecutorOptions {
  /**
   * The Lambda SDK
   */
  readonly lambda: AWS.Lambda;
}

/**
 * Executes a lambda function
 */
export class LambdaFunctionExecutor extends Executor {
  private readonly lambda: AWS.Lambda;

  constructor(options: LambdaFunctionExecutorOptions) {
    super(options);
    this.lambda = options.lambda;
  }

  async execute(input?: string): Promise<ExecuteResult> {
    this.validateJsonObjectInput(input);

    const response = await this.lambda.invoke({
      FunctionName: this.physicalResourceId,
      Payload: input,
    }).promise();

    const payload = response.Payload?.toString();
    if (!payload) {
      throw new Error('Lambda invocation did not return a payload');
    }

    const output = JSON.parse(payload);
    const errorMessage = getLambdaErrorMessage(output);
    if (errorMessage) {
      return {
        error: `Lambda returned an error message: ${errorMessage}`,
        output,
      };
    }

    return {
      output,
    };
  }
}

function getLambdaErrorMessage(output: any) {
  if (typeof output !== 'object' || output === null) {
    return;
  }

  if (output.errorMessage) {
    return output.errorMessage;
  }

  return;
}

function isJsonObject(json: string) {
  try {
    return typeof JSON.parse(json) == 'object';
  } catch (e) {
    return false;
  }
}
