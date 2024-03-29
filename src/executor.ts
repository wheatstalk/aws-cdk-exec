import * as AWS from 'aws-sdk';
import { IAwsSdk, LazyListStackResources } from './aws-sdk';
import { FindMatchingResourceOptionsCommon, findMatchingResources, MatchingResource } from './find-matching-resources';

const STATE_MACHINE_TYPE = 'AWS::StepFunctions::StateMachine';
const LAMBDA_TYPE = 'AWS::Lambda::Function';

/**
 * Options for `StateMachineExecutor`
 */
export interface ExecutorOptions {
  /**
   * The construct path of the matching resource.
   */
  readonly constructPath: string;

  /**
   * The logical id of the matching resource.
   */
  readonly logicalResourceId: string;

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
  static async find(options: FindExecutorOptions): Promise<Executor[]> {
    return findExecutors(options);
  }

  readonly constructPath: string;
  readonly physicalResourceId: string;
  readonly logicalResourceId: string;

  protected constructor(options: ExecutorOptions) {
    this.physicalResourceId = options.physicalResourceId;
    this.constructPath = options.constructPath;
    this.logicalResourceId = options.logicalResourceId;
  }

  /**
   * Execute the resource
   *
   * @param input Input for execution.
   */
  abstract execute(input?: string): Promise<ExecuteResult>;

  public env(): Promise<Record<string, string>> {
    return Promise.resolve({});
  };

  protected validateJsonObjectInput(input: string | undefined) {
    if (input && !isJsonObject(input)) {
      throw new Error('The provided input should be a JSON object');
    }
  }
}

/**
 * Options for finding executors.
 */
export interface FindExecutorOptions extends FindMatchingResourceOptionsCommon {
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

      // Get the end of the execution history where we should find the final
      // events/cause for the execution's failure.
      const history = await this.stepFunctions.getExecutionHistory({
        executionArn: execution.executionArn,
        reverseOrder: true,
      }).promise();

      function getErrorOutput(events: AWS.StepFunctions.HistoryEventList) {
        for (const event of events) {
          switch (event.type) {
            case 'ExecutionFailed':
              try {
                // Decode a JSON-encoded cause, such as for when a Lambda task
                // exception was the root cause.
                return {
                  ...event.executionFailedEventDetails,
                  cause: JSON.parse(event.executionFailedEventDetails?.cause!),
                };
              } catch (e) {
                return event.executionFailedEventDetails;
              }

            case 'ExecutionAborted':
              return event.executionAbortedEventDetails;
            case 'ExecutionTimedOut':
              return event.executionTimedOutEventDetails;
          }
        }

        return;
      }

      return {
        error: `State machine execution's final status is ${executionStatus}`,
        output: getErrorOutput(history.events),
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
    const error = getLambdaErrorMessage(output);
    if (error) {
      return {
        error,
        output,
      };
    }

    return {
      output,
    };
  }

  public async env(): Promise<Record<string, string>> {
    const config = await this.lambda.getFunctionConfiguration({
      FunctionName: this.physicalResourceId,
    }).promise();

    const environmentVariables = config.Environment?.Variables;
    return environmentVariables ?? {};
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
async function findExecutors(options: FindExecutorOptions): Promise<Executor[]> {
  const { sdk } = options;

  const matchingResources = findMatchingResources({
    ...options,
    types: [
      STATE_MACHINE_TYPE,
      LAMBDA_TYPE,
    ],
  });

  const lazyListStackResources: Record<string, LazyListStackResources> = {};
  function getLazyListStackResources(matchingResource: MatchingResource) {
    if (!lazyListStackResources[matchingResource.stackName]) {
      lazyListStackResources[matchingResource.stackName] = new LazyListStackResources(sdk, matchingResource.stackName);
    }

    return lazyListStackResources[matchingResource.stackName];
  }

  return Promise.all(
    matchingResources.map(async (matchingResource) => {
      // Cache lazy lists
      const listStackResources = getLazyListStackResources(matchingResource);

      const stackResource = (await listStackResources.listStackResources())
        .find(sr => sr.LogicalResourceId === matchingResource.logicalResourceId);

      if (!stackResource || !stackResource.PhysicalResourceId) {
        throw new Error(`Could not find the physical resource id for ${matchingResource.constructPath}`);
      }

      switch (stackResource.ResourceType) {
        case STATE_MACHINE_TYPE:
          return new StateMachineExecutor({
            constructPath: matchingResource.constructPath,
            logicalResourceId: matchingResource.logicalResourceId,
            physicalResourceId: stackResource.PhysicalResourceId,
            stepFunctions: sdk.stepFunctions(),
          });

        case LAMBDA_TYPE:
          return new LambdaFunctionExecutor({
            constructPath: matchingResource.constructPath,
            logicalResourceId: matchingResource.logicalResourceId,
            physicalResourceId: stackResource.PhysicalResourceId,
            lambda: sdk.lambda(),
          });

        default:
          throw new Error(`Unsupported resource type ${stackResource.ResourceType}`);
      }
    }),
  );
}

function isJsonObject(json: string) {
  try {
    return typeof JSON.parse(json) == 'object';
  } catch (e) {
    return false;
  }
}
