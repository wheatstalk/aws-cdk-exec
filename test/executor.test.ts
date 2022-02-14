import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { App, CfnElement, Stack } from 'aws-cdk-lib';
import * as aws_lambda from 'aws-cdk-lib/aws-lambda';
import * as aws_sqs from 'aws-cdk-lib/aws-sqs';
import * as aws_stepfunctions from 'aws-cdk-lib/aws-stepfunctions';
import * as cxapi from 'aws-cdk-lib/cx-api';
import AWS from 'aws-sdk';
import { Construct } from 'constructs';
import { IAwsSdk } from '../src/aws-sdk';
import { getExecutor, StateMachineExecutor, LambdaFunctionExecutor } from '../src/executor';

function testAssembly(cb: (app: App) => void): cxapi.CloudAssembly {
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmp'));

  const app = new App({
    outdir: appDir,
    context: {
      [cxapi.PATH_METADATA_ENABLE_CONTEXT]: true,
    },
  });

  cb(app);

  app.synth();

  return new cxapi.CloudAssembly(appDir);
}

class TestStack extends Stack {
  constructor(scope: Construct, id: string) {
    super(scope, id);
  }

  protected allocateLogicalId(cfnElement: CfnElement): string {
    return cfnElement.node.path.split('/').join('X').toUpperCase().replace(/[^A-Z0-9]/, '');
  }
}

class MockAwsSdk implements IAwsSdk {
  static stub(stub: any): any {
    return new Proxy({}, {
      get(_target: {}, p: string | symbol, _receiver: any): any {
        if (!stub[p]) {
          throw new Error(`${String(p)} is not mocked`);
        }
        return () => ({
          promise: () => stub[p](),
        });
      },
    });
  }

  cloudFormation(): AWS.CloudFormation {
    throw new Error('Not stubbed');
  }

  stubCloudFormation(client: any) {
    this.cloudFormation = () => MockAwsSdk.stub(client);
  }

  lambda(): AWS.Lambda {
    throw new Error('Not stubbed');
  }

  stubLambda(client: any) {
    this.lambda = () => MockAwsSdk.stub(client);
  }

  stepFunctions(): AWS.StepFunctions {
    throw new Error('Not stubbed');
  }

  stubStepFunctions(client: any) {
    this.stepFunctions = () => MockAwsSdk.stub(client);
  }
}

describe('getExecutor', () => {
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
      const executor = await getExecutor({
        sdk,
        constructPath: 'Stack/Boom/Resource',
        stackArtifacts: assembly.stacks,
      });

      // THEN
      expect(executor).toBeInstanceOf(StateMachineExecutor);
      expect(executor.physicalResourceId).toEqual('physical-boom');
    });

    test('L2 state machine executor', async () => {
      // WHEN
      const executor = await getExecutor({
        sdk: sdk,
        constructPath: 'Stack/Boom/Resource',
        stackArtifacts: assembly.stacks,
      });

      // THEN
      expect(executor).toBeInstanceOf(StateMachineExecutor);
      expect(executor.physicalResourceId).toEqual('physical-boom');
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
      const executor = await getExecutor({
        sdk,
        constructPath: 'Stack/Boom/Resource',
        stackArtifacts: assembly.stacks,
      });

      // THEN
      expect(executor).toBeInstanceOf(LambdaFunctionExecutor);
      expect(executor.physicalResourceId).toEqual('physical-boom');
    });

    test('L2 lambda function executor', async () => {
      // WHEN
      const executor = await getExecutor({
        sdk,
        constructPath: 'Stack/Boom/Resource',
        stackArtifacts: assembly.stacks,
      });

      // THEN
      expect(executor).toBeInstanceOf(LambdaFunctionExecutor);
      expect(executor.physicalResourceId).toEqual('physical-boom');
    });
  });

  describe('errors', () => {
    test('errors on unsupported type', async () => {
      const assembly = testAssembly(app => {
        const stack = new TestStack(app, 'Stack');
        new aws_sqs.Queue(stack, 'Boom');
      });
      const sdk = new MockAwsSdk();
      sdk.stubCloudFormation({
        describeStackResources: async () => {
          return {
            StackResources: [{
              ResourceType: 'AWS::SQS::Queue',
              ResourceStatus: 'CREATE_COMPLETE',
              LastUpdatedTimestamp: new Date(),
              LogicalResourceId: 'STACKXBOOMXRESOURCE',
              PhysicalResourceId: 'physical-boom',
            }],
          };
        },
      });

      // WHEN
      await expect(async () => {
        await getExecutor({
          sdk,
          constructPath: 'Stack/Boom',
          stackArtifacts: assembly.stacks,
        });
      }).rejects.toThrow(/unsupported resource type/i);
    });

    test('errors when path not found', async () => {
      const assembly = testAssembly(app => {
        new Stack(app, 'Stack');
      });
      const sdk = new MockAwsSdk();

      // WHEN
      await expect(async () => {

        await getExecutor({
          sdk,
          constructPath: 'Stack/does-not-exist',
          stackArtifacts: assembly.stacks,
        });
      }).rejects.toThrow(/could not find.*construct path/i);
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
      startExecution: () => ({
        executionArn: 'execution-arn',
        startDate: new Date(),
      }),
      describeExecution: () => {
        return ({
          status: 'FAILED',
          stateMachineArn: 'state-machine-arn',
          executionArn: 'execution-arn',
          startDate: new Date(),
        });
      },
    });

    const stepFunctions = sdk.stepFunctions();

    // WHEN
    const executor = new StateMachineExecutor({
      physicalResourceId: 'state-machine-arn',
      stepFunctions,
    });
    const result = await executor.execute();

    // THEN
    expect(result.error).toBeDefined();
  });

  test('errors when input is invalid', async () => {
    const sdk = new MockAwsSdk();
    sdk.stubStepFunctions({});
    const stepFunctions = sdk.stepFunctions();

    const executor = new StateMachineExecutor({
      physicalResourceId: 'state-machine-arn',
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
      physicalResourceId: 'state-machine-arn',
      lambda,
    });

    // WHEN
    await expect(async () => {
      await executor.execute('INVALID');
    }).rejects.toThrow(/json object/i);
  });
});
