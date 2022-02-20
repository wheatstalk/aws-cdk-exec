import * as aws_stepfunctions from 'aws-cdk-lib/aws-stepfunctions';
import { findMatchingResources } from '../src/find-matching-resources';
import { testAssembly, TestStack } from './util';

describe('findMatchingResources', () => {
  test.each([undefined, 'Stack'])('constructPath = %s', (constructPath) => {
    const assembly = testAssembly(app => {
      const stack = new TestStack(app, 'Stack');
      new aws_stepfunctions.StateMachine(stack, 'Boom1', {
        definition: new aws_stepfunctions.Succeed(stack, 'Succeed1'),
      });
      new aws_stepfunctions.StateMachine(stack, 'Boom2', {
        definition: new aws_stepfunctions.Succeed(stack, 'Succeed2'),
      });
    });

    // WHEN
    const results = findMatchingResources({
      constructPath: constructPath,
      types: ['AWS::StepFunctions::StateMachine'],
      assembly,
    });

    // THEN
    expect(results.length).toEqual(2);
    expect(results).toEqual([
      {
        constructPath: 'Stack/Boom1/Resource',
        logicalResourceId: 'STACKXBOOM1XRESOURCE',
        stackName: 'Stack',
        type: 'AWS::StepFunctions::StateMachine',
      },
      {
        constructPath: 'Stack/Boom2/Resource',
        logicalResourceId: 'STACKXBOOM2XRESOURCE',
        stackName: 'Stack',
        type: 'AWS::StepFunctions::StateMachine',
      },
    ]);
  });
});