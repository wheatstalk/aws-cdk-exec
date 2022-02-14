import { App, Stack } from 'aws-cdk-lib';
import { Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda';
import { Choice, Condition, Fail, StateMachine, Succeed } from 'aws-cdk-lib/aws-stepfunctions';

const app = new App();
const stack = new Stack(app, 'integ-cdk-exec');

new StateMachine(stack, 'StateMachine', {
  definition: new Choice(stack, 'Choice')
    .when(Condition.isPresent('$.succeed'),
      new Succeed(stack, 'ChoiceSucceed'))
    .otherwise(
      new Fail(stack, 'ChoiceFail')),
});

new Function(stack, 'Function', {
  runtime: Runtime.PYTHON_3_9,
  handler: 'index.handler',
  code: Code.fromInline(`
def handler(event, context):
  if "succeed" in event:
    return {"succeed": True, "message": "Hello from Lambda"}

  raise Exception('Error from lambda')
`),
});

app.synth();