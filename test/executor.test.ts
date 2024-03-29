import { Stack } from 'aws-cdk-lib';
import * as aws_lambda from 'aws-cdk-lib/aws-lambda';
import * as aws_stepfunctions from 'aws-cdk-lib/aws-stepfunctions';
import { MockAwsSdk, testAssembly, TestStack } from './util';
import { Executor, LambdaFunctionExecutor, StateMachineExecutor } from '../src/executor';

describe('Executor', () => {
  describe('state machine', () => {
    // GIVEN
    const assembly = testAssembly(app => {
      const stack = new TestStack(app, 'Stack');
      new aws_stepfunctions.StateMachine(stack, 'Boom', {
        definition: new aws_stepfunctions.Succeed(stack, 'Succeed'),
      });
    });

    const sdk = new MockAwsSdk();
    sdk.stubCloudFormation({
      describeStackResources: async () => {
        return {
          StackResources: [{
            ResourceType: 'AWS::StepFunctions::StateMachine',
            ResourceStatus: 'CREATE_COMPLETE',
            LastUpdatedTimestamp: new Date(),
            LogicalResourceId: 'STACKXBOOMXRESOURCE',
            PhysicalResourceId: 'physical-boom',
          }],
        };
      },
    });
    sdk.stubStepFunctions({});

    test('L1 state machine executor', async () => {
      // WHEN
      const executors = await Executor.find({
        sdk,
        constructPath: 'Stack/Boom/Resource',
        assembly,
      });

      // THEN
      expect(executors[0]).toBeInstanceOf(StateMachineExecutor);
      expect(executors[0].physicalResourceId).toEqual('physical-boom');
    });

    test('L2 state machine executor', async () => {
      // WHEN
      const executors = await Executor.find({
        sdk: sdk,
        constructPath: 'Stack/Boom/Resource',
        assembly,
      });

      // THEN
      expect(executors[0]).toBeInstanceOf(StateMachineExecutor);
      expect(executors[0].physicalResourceId).toEqual('physical-boom');
    });
  });

  describe('lambda function', () => {
    // GIVEN
    const assembly = testAssembly(app => {
      const stack = new TestStack(app, 'Stack');
      new aws_lambda.Function(stack, 'Boom', {
        runtime: aws_lambda.Runtime.PYTHON_3_9,
        code: aws_lambda.Code.fromInline('# Not empty'),
        handler: 'index.handler',
      });
    });

    const sdk = new MockAwsSdk();
    sdk.stubCloudFormation({
      describeStackResources: async () => {
        return {
          StackResources: [{
            ResourceType: 'AWS::Lambda::Function',
            ResourceStatus: 'CREATE_COMPLETE',
            LastUpdatedTimestamp: new Date(),
            LogicalResourceId: 'STACKXBOOMXRESOURCE',
            PhysicalResourceId: 'physical-boom',
          }],
        };
      },
    });
    sdk.stubLambda({});

    test('L1 lambda function executor', async () => {
      // WHEN
      const executors = await Executor.find({
        sdk,
        constructPath: 'Stack/Boom/Resource',
        assembly,
      });

      // THEN
      expect(executors[0]).toBeInstanceOf(LambdaFunctionExecutor);
      expect(executors[0].physicalResourceId).toEqual('physical-boom');
    });

    test('L2 lambda function executor', async () => {
      // WHEN
      const executors = await Executor.find({
        sdk,
        constructPath: 'Stack/Boom/Resource',
        assembly,
      });

      // THEN
      expect(executors[0]).toBeInstanceOf(LambdaFunctionExecutor);
      expect(executors[0].physicalResourceId).toEqual('physical-boom');
    });
  });

  describe('errors', () => {
    test('path not found', async () => {
      const assembly = testAssembly(app => {
        new Stack(app, 'Stack');
      });
      const sdk = new MockAwsSdk();

      // WHEN
      const executor = await Executor.find({
        sdk,
        constructPath: 'Stack/does-not-exist',
        assembly,
      });

      // THEN
      expect(executor).toEqual([]);
    });
  });
});

describe('StateMachineExecutor', () => {
  test('success after running', async () => {
    const sdk = new MockAwsSdk();
    let describeCount = 0;
    sdk.stubStepFunctions({
      startExecution: () => ({
        executionArn: 'execution-arn',
        startDate: new Date(),
      }),
      describeExecution: () => {
        describeCount += 1;
        return ({
          status: describeCount >= 2 ? 'SUCCEEDED' : 'RUNNING',
          stateMachineArn: 'state-machine-arn',
          executionArn: 'execution-arn',
          output: JSON.stringify({ something: 'here' }),
          startDate: new Date(),
        });
      },
    });

    const stepFunctions = sdk.stepFunctions();

    // WHEN
    const executor = new StateMachineExecutor({
      constructPath: 'some/path',
      logicalResourceId: 'SomePath',
      physicalResourceId: 'state-machine-arn',
      stepFunctions,
    });

    // THEN
    const result = await executor.execute();
    expect(result.error).not.toBeDefined();
    expect(result.output).toEqual({
      something: 'here',
    });
  });

  test('fail status', async () => {
    const sdk = new MockAwsSdk();
    sdk.stubStepFunctions({
      startExecution: () => {
        return {
          executionArn: 'execution-arn',
          startDate: new Date(),
        };
      },
      describeExecution: () => {
        return {
          status: 'FAILED',
          stateMachineArn: 'state-machine-arn',
          executionArn: 'execution-arn',
          startDate: new Date(),
        };
      },
      getExecutionHistory: () => {
        return {
          events: [{
            type: 'ExecutionFailed',
            executionFailedEventDetails: {
              error: 'Test error',
              cause: 'Because the test says so',
            },
          }],
        };
      },
    });

    const stepFunctions = sdk.stepFunctions();

    // WHEN
    const executor = new StateMachineExecutor({
      constructPath: 'some/path',
      logicalResourceId: 'SomePath',
      physicalResourceId: 'state-machine-arn',
      stepFunctions,
    });
    const result = await executor.execute();

    // THEN
    expect(result.error).toBeDefined();
    expect(result.output).toEqual({
      error: 'Test error',
      cause: 'Because the test says so',
    });
  });

  test('fail status with nested json cause', async () => {
    const sdk = new MockAwsSdk();
    sdk.stubStepFunctions({
      startExecution: () => {
        return {
          executionArn: 'execution-arn',
          startDate: new Date(),
        };
      },
      describeExecution: () => {
        return {
          status: 'FAILED',
          stateMachineArn: 'state-machine-arn',
          executionArn: 'execution-arn',
          startDate: new Date(),
        };
      },
      getExecutionHistory: () => {
        return {
          events: [{
            type: 'ExecutionFailed',
            executionFailedEventDetails: {
              error: 'Test error',
              cause: JSON.stringify({
                nestedJson: true,
              }),
            },
          }],
        };
      },
    });

    const stepFunctions = sdk.stepFunctions();

    // WHEN
    const executor = new StateMachineExecutor({
      constructPath: 'some/path',
      logicalResourceId: 'SomePath',
      physicalResourceId: 'state-machine-arn',
      stepFunctions,
    });
    const result = await executor.execute();

    // THEN
    expect(result.error).toBeDefined();
    expect(result.output).toEqual({
      error: 'Test error',
      cause: {
        nestedJson: true,
      },
    });
  });

  test('errors when input is invalid', async () => {
    const sdk = new MockAwsSdk();
    sdk.stubStepFunctions({});
    const stepFunctions = sdk.stepFunctions();

    const executor = new StateMachineExecutor({
      physicalResourceId: 'state-machine-arn',
      constructPath: 'some/path',
      logicalResourceId: 'SomePath',
      stepFunctions,
    });

    // WHEN
    await expect(async () => {
      await executor.execute('INVALID');
    }).rejects.toThrow(/json object/i);
  });
});

describe('LambdaFunctionExecutor', () => {
  test('success', async () => {
    // GIVEN
    const sdk = new MockAwsSdk();
    sdk.stubLambda({
      invoke: () => {
        return {
          Payload: JSON.stringify({ something: 'here' }),
        };
      },
    });
    const lambda = sdk.lambda();

    // WHEN
    const executor = new LambdaFunctionExecutor({
      lambda,
      constructPath: 'some/path',
      logicalResourceId: 'SomePath',
      physicalResourceId: 'some-function-name',
    });

    // THEN
    const result = await executor.execute();
    expect(result.error).not.toBeDefined();
    expect(result.output).toEqual({
      something: 'here',
    });
  });

  test('lambda exceptions', async () => {
    // GIVEN
    const sdk = new MockAwsSdk();
    sdk.stubLambda({
      invoke: () => {
        return {
          Payload: JSON.stringify({
            errorMessage: 'Error!',
            errorType: 'Exception',
            requestId: 'a6f14415-ce13-47e5-8e5f-2abc7654a656',
            stackTrace: [
              "  File \"/var/task/index.py\", line 3, in handler\n    raise Exception('Error!')\n",
            ],
          }),
        };
      },
    });
    const lambda = sdk.lambda();

    // WHEN
    const executor = new LambdaFunctionExecutor({
      lambda,
      constructPath: 'some/path',
      logicalResourceId: 'SomePath',
      physicalResourceId: 'some-function-name',
    });

    // THEN
    const result = await executor.execute();
    expect(result.error).toContain('Error!');
  });

  test('errors when input is invalid', async () => {
    const sdk = new MockAwsSdk();
    sdk.stubLambda({});
    const lambda = sdk.lambda();

    const executor = new LambdaFunctionExecutor({
      constructPath: 'some/path',
      logicalResourceId: 'SomePath',
      physicalResourceId: 'state-machine-arn',
      lambda,
    });

    // WHEN
    await expect(async () => {
      await executor.execute('INVALID');
    }).rejects.toThrow(/json object/i);
  });
});
