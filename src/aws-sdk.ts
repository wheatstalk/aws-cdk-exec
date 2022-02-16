import AWS from 'aws-sdk';

export interface IAwsSdk {
  /**
   * Get the CloudFormation client.
   */
  cloudFormation(): AWS.CloudFormation;

  /**
   * Get the StepFunctions SDK client.
   */
  stepFunctions(): AWS.StepFunctions;

  /**
   * Get the Lambda SDK client.
   */
  lambda(): AWS.Lambda;
}

/**
 * Creates AWS SDK clients.
 */
export class AwsSdk implements IAwsSdk {
  cloudFormation(): AWS.CloudFormation {
    return new AWS.CloudFormation();
  }
  stepFunctions(): AWS.StepFunctions {
    return new AWS.StepFunctions();
  }
  lambda(): AWS.Lambda {
    return new AWS.Lambda();
  }
}

/**
 * List stack resources.
 */
export class LazyListStackResources {
  private readonly stackName: string;
  private readonly cloudFormation: AWS.CloudFormation;
  private stackResources?: AWS.CloudFormation.StackResources;

  constructor(sdk: AwsSdk, stackName: string) {
    this.cloudFormation = sdk.cloudFormation();
    this.stackName = stackName;
  }

  async listStackResources(): Promise<AWS.CloudFormation.StackResources> {
    if (!this.stackResources) {
      this.stackResources = await this.listStackResourcesActual();
    }

    return this.stackResources;
  }

  private async listStackResourcesActual() {
    const res = await this.cloudFormation.describeStackResources({
      StackName: this.stackName,
    }).promise();

    if (!res.StackResources) {
      throw new Error('Stack resources not available');
    }

    return res.StackResources;
  }
}