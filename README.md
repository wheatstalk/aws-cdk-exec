# AWS CDK Exec

Provides `cdk-exec`, an AWS CDK dev tool to quickly find and execute your
Lambdas and State Machines in AWS.

```
$ cdk-exec integ-cdk-exec/Function --input '{"succeed":true}'
✨  Executing integ-cdk-exec-Function76856677-k5ehIzbG2T6S

Output:
{
  "succeed": true,
  "message": "Hello from Lambda"
}

✅  Execution succeeded
```

> WARNING: Do not rely on this tool to execute your functions in a production
> environment. Now that you have been warned, please read on.

## Usage

First, add `@wheatstalk/aws-cdk-exec` to your project's dev dependencies.
Then synthesize your app to a `cdk.out` directory. Once synthesized there, you
can execute one of your resources with `cdk-exec`.

> If you're using `cdk watch`, the CDK will keep your `cdk.out` up to date, so
> when you use watch mode, you can run `cdk-exec` (roughly) at will.

## Full Example

**app.ts**

```ts
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
```

**Synthesize your app**

The `cdk-exec` tool operates on a synthesized cloud assembly (your `cdk.out`
directory), so the first step is to synthesize your app:

```console
$ cdk synth --output cdk.out
```

**Execute a state machine with input**

```
$ cdk-exec integ-cdk-exec/StateMachine --input '{"succeed":true}'
✨  Executing arn:aws:states:REGION:000000000000:stateMachine:StateMachine2E01A3A5-8z4XHXAvT3qq

Output:
{
  "succeed": true
}

✅  Execution succeeded
```

**Execute a lambda with input**

```
$ cdk-exec integ-cdk-exec/Function --input '{"succeed":true}'
✨  Executing integ-cdk-exec-Function76856677-k5ehIzbG2T6S

Output:
{
  "succeed": true,
  "message": "Hello from Lambda"
}

✅  Execution succeeded
```

**Use a custom cloud assembly directory**

```
$ cdk-exec --app path/to/cdkout integ-cdk-exec/Function --input '{"json":"here"}'
✨  Executing integ-cdk-exec-Function76856677-k5ehIzbG2T6S

Output:
{
  "succeed": true,
  "message": "Hello from Lambda"
}

✅  Execution succeeded
```

**Path matching**

`cdk-exec` searches for resources matching the exact path you provide and any
deeper nested resources. This is how we support both L1 & L2 constructs, but
is also a convenient shortcut when your app has only one executable resource.

For example, if you have only one function or state machine in a stack, you
can type `cdk-exec my-stack` and your resource will be found. If your entire
app has only one executable resource, you can run `cdk-exec` without arguments
to run it. However, if you provide an ambiguous path, matching more than one
supported resource, you will receive an error message.

**Path metadata**

This tool requires path metadata to be enabled in your assembly.
