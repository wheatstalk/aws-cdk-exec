import * as cxapi from 'aws-cdk-lib/cx-api';
import * as AWS from 'aws-sdk';
import { IAwsSdk, LazyListStackResources } from './aws-sdk';
import { findMatchingResources, MatchingResource } from './find-matching-resources';

const STATE_MACHINE_TYPE = 'AWS::StepFunctions::StateMachine';
const LAMBDA_TYPE = 'AWS::Lambda::Function';

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
 * Executor base class.
 */
export abstract class Executor {
  /**
   * Find an executor
   */
  static async find(options: FindExecutorOptions): Promise<Executor | undefined> {
    return findExecutor(options);
  }

  readonly physicalResourceId: string;

  protected constructor(options: ExecutorOptions) {
    this.physicalResourceId = options.physicalResourceId;
  }

  /**
   * Execute the resource
   *
   * @param input Input for execution.
   */
  abstract execute(input?: string): Promise<ExecuteResult>;

  protected validateJsonObjectInput(input: string | undefined) {
    if (input && !isJsonObject(input)) {
      throw new Error('The provided input should be a JSON object');
    }
  }
}

/**
 * Options for finding executors.
 */
export interface FindExecutorOptions {
  /**
   * The Cloud Assembly
   */
  readonly assembly: cxapi.CloudAssembly;

  /**
   * Path to the resource containing the state machine to execute.
   */
  readonly constructPath?: string;

  /**
   * AWS SDK
   */
  readonly sdk: IAwsSdk;
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

/**
 * Finds an executor.
 */
async function findExecutor(options: FindExecutorOptions): Promise<Executor | undefined> {
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
    throw new AmbiguousPathError(matchingResources);
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

/**
 * The given path is ambiguous.
 */
export class AmbiguousPathError extends Error {
  public readonly matchingPaths: string[];

  constructor(matchingResources: MatchingResource[]) {
    const matchingPaths = matchingResources.map(r => r.constructPath);
    super(`The provided path matches multiple resources: ${matchingPaths.join(', ')}`);

    this.matchingPaths = matchingPaths;
  }
}

function isJsonObject(json: string) {
  try {
    return typeof JSON.parse(json) == 'object';
  } catch (e) {
    return false;
  }
}
