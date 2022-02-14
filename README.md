# AWS CDK Exec

Provides the `cdk-cloudexec` command that executes lambda functions or step
function state machines when given a path to the construct in the user's app.

## Usage

First, add `@wheatstalk/aws-cdk-cloudexec` to your project's dev dependencies.
Then synthesize your app to a `cdk.out` directory. Once synthesized there, you can
then execute one of your resources with a command like
`cdk-cloudexec --app cdk.out exec path/to/resource`.

## Example

**app.ts**

```ts
import { App, Stack } from 'aws-cdk-lib';
import { Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda';
import { Choice, Condition, Fail, StateMachine, Succeed } from 'aws-cdk-lib/aws-stepfunctions';

const app = new App();
const stack = new Stack(app, 'integ-cdk-exec');

new StateMachine(stack, 'StateMachine', {
  definition: new Choice(stack, 'Choice')
    .when(Condition.isPresent('$.succeed'), new Succeed(stack, 'ChoiceSucceed'))
    .otherwise(new Fail(stack, 'ChoiceFail')),
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
```

**Synthesize your app**
```console
$ cdk synth --output cdk.out
```

**Execute a state machine with input**
```
$ cdk-cloudexec --app cdk.out exec integ-cdk-exec/StateMachine --input '{"json":"here"}'
✨  Executing arn:aws:states:REGION:0000000000:stateMachine:StateMachine2E01A3A5-kPnq1OgV5KYX

Output:
{
  "succeed": true,
  "foo": "bar"
}

✅  Execution succeeded
```

**Execute a function with input**
```
$ cdk-cloudexec --app cdk.out exec integ-cdk-exec/Function --input '{"json":"here"}'
✨  Executing arn:aws:states:REGION:0000000000:stateMachine:StateMachine2E01A3A5-kPnq1OgV5KYX

Output:
{
  "succeed": true,
  "foo": "bar"
}

✅  Execution succeeded
```