import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { App, CfnElement, Stack } from 'aws-cdk-lib';
import * as cxapi from 'aws-cdk-lib/cx-api';
import * as AWS from 'aws-sdk';
import { Construct } from 'constructs';
import { IAwsSdk } from '../src/aws-sdk';

export function testAssembly(cb: (app: App) => void, pathMetadata?: boolean): cxapi.CloudAssembly {
  const appDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tmp'));

  const patchMetadataContext = (pathMetadata ?? true) ? {
    [cxapi.PATH_METADATA_ENABLE_CONTEXT]: true,
  } : undefined;

  const app = new App({
    outdir: appDir,
    context: {
      ...patchMetadataContext,
    },
  });

  cb(app);

  app.synth();

  return new cxapi.CloudAssembly(appDir);
}

export class TestStack extends Stack {
  constructor(scope: Construct, id: string) {
    super(scope, id);
  }

  protected allocateLogicalId(cfnElement: CfnElement): string {
    return cfnElement.node.path.split('/').join('X').toUpperCase().replace(/[^A-Z0-9]/, '');
  }
}

export class MockAwsSdk implements IAwsSdk {
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