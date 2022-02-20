import { CfnResource } from 'aws-cdk-lib';
import * as aws_stepfunctions from 'aws-cdk-lib/aws-stepfunctions';
import { findMatchingResources, MetadataMatch } from '../src/find-matching-resources';
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

  describe('metadata match', () => {
    const assembly = testAssembly(app => {
      const stack = new TestStack(app, 'Stack');
      const sfn1 = new aws_stepfunctions.StateMachine(stack, 'Boom1', {
        definition: new aws_stepfunctions.Succeed(stack, 'Succeed1'),
      });
      const sfn1Resource = sfn1.node.defaultChild as CfnResource;
      sfn1Resource.addMetadata('group', 'sfn1');
      sfn1Resource.addMetadata('other', 'other');

      const sfn2 = new aws_stepfunctions.StateMachine(stack, 'Boom2', {
        definition: new aws_stepfunctions.Succeed(stack, 'Succeed2'),
      });
      const sfn2Resource = sfn2.node.defaultChild as CfnResource;
      sfn2Resource.addMetadata('group', 'sfn2');

      new aws_stepfunctions.StateMachine(stack, 'Boom3', {
        definition: new aws_stepfunctions.Succeed(stack, 'Succeed3'),
      });
    });

    test('bare key', () => {
      // WHEN
      const matchingResources = findMatchingResources({
        assembly,
        types: ['AWS::StepFunctions::StateMachine'],
        metadata: new MetadataMatch(['group']),
      });

      // THEN
      expect(matchingResources).toHaveLength(2);
      expect(matchingResources[0].constructPath).toEqual('Stack/Boom1/Resource');
      expect(matchingResources[1].constructPath).toEqual('Stack/Boom2/Resource');
    });

    test('key=value', () => {
      // WHEN
      const matchingResources = findMatchingResources({
        assembly,
        types: ['AWS::StepFunctions::StateMachine'],
        metadata: new MetadataMatch(['group=sfn2']),
      });

      // THEN
      expect(matchingResources).toHaveLength(1);
      expect(matchingResources[0].constructPath).toEqual('Stack/Boom2/Resource');
    });

    test('multiple keys and values', () => {
      // WHEN
      const matchingResources = findMatchingResources({
        assembly,
        types: ['AWS::StepFunctions::StateMachine'],
        metadata: new MetadataMatch(['group', 'other']),
      });

      // THEN
      expect(matchingResources).toHaveLength(1);
      expect(matchingResources[0].constructPath).toEqual('Stack/Boom1/Resource');
    });
  });
});