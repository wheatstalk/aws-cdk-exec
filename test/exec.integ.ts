import { App, CfnResource, Stack, Tags } from 'aws-cdk-lib';
import { Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Choice, Condition, Fail, StateMachine, Succeed } from 'aws-cdk-lib/aws-stepfunctions';

const app = new App();
const stack = new Stack(app, 'integ-cdk-exec');

const sfn = new StateMachine(stack, 'StateMachine', {
  definition: new Choice(stack, 'Choice')
    .when(Condition.isPresent('$.succeed'),
      new Succeed(stack, 'ChoiceSucceed'))
    .otherwise(
      new Fail(stack, 'ChoiceFail')),
});
(sfn.node.defaultChild as CfnResource).addMetadata('integ', 'sfn');
Tags.of(sfn).add('integ', 'sfn');

const secret = new Secret(stack, 'Secret');

const fn = new Function(stack, 'Function', {
  runtime: Runtime.PYTHON_3_9,
  handler: 'index.handler',
  code: Code.fromInline(`
def handler(event, context):
  if "succeed" in event:
    return {"succeed": True, "message": "Hello from Lambda"}

  raise Exception('Error from lambda')
`),
  environment: {
    FOO: 'bar',
    SECRET_ARN: secret.secretArn,
  },
});
secret.grantRead(fn);
(fn.node.defaultChild as CfnResource).addMetadata('integ', 'lambda');
Tags.of(fn).add('integ', 'lambda');

app.synth();