const { typescript, javascript } = require('projen');

const project = new typescript.TypeScriptProject({
  defaultReleaseBranch: 'main',
  name: '@wheatstalk/aws-cdk-exec',
  authorName: 'Josh Kellendonk',
  authorEmail: 'joshkellendonk@gmail.com',
  repository: 'https://github.com/wheatstalk/aws-cdk-exec',
  description: 'An AWS CDK Cloud Assembly-aware command to help find and execute lambda functions and state machines',
  keywords: ['cdk', 'cdk-extension', 'cli', 'lambda', 'stepfunctions'],

  deps: [
    'aws-sdk@^2.0.0',
    'yargs@^17.0.0',
    'chalk@^4.0.0',
  ],

  peerDeps: [
    'aws-cdk-lib@^2.0.0',
  ],

  devDeps: [
    'aws-sdk-mock',
    'aws-cdk@^2.0.0',
    'constructs@^10.0.0',
    '@types/yargs@^17.0.0',
    'ts-node',
  ],

  releaseToNpm: true,
  npmAccess: javascript.NpmAccess.PUBLIC,

  depsUpgradeOptions: {
    ignoreProjen: false,
  },
  autoApproveUpgrades: true,
  autoApproveOptions: {
    allowedUsernames: ['misterjoshua'],
  },
});

project.addGitIgnore('/.idea');

project.package.addBin({
  'cdk-exec': 'lib/cli/cdk-exec.js',
});

// Integration Test Setup
const tsNode = `ts-node -P ${project.tsconfigDev.fileName}`;
const appDir = 'test/exec.integ.snapshot';

const deployTask = project.addTask('integ:exec:deploy');
deployTask.exec(`rm -fr ${appDir}`);
deployTask.exec(`cdk --app "${tsNode} test/exec.integ.ts" deploy --output ${appDir}`);

const cliCmd = `${tsNode} src/cli/cdk-exec.ts --app ${appDir}`;
project.addTask('integ:exec:succeed', {
  exec: `${cliCmd} -am integ --input '{"succeed":true}'`,
});
project.addTask('integ:exec:sfn:succeed', {
  exec: `${cliCmd} -m integ=sfn --input '{"succeed":true}'`,
});
project.addTask('integ:exec:sfn:fail', {
  exec: `${cliCmd} -m integ=sfn integ-cdk-exec/StateMachine`,
});
project.addTask('integ:exec:lambda:succeed', {
  exec: `${cliCmd} -m integ=lambda --input '{"succeed":true}'`,
});
project.addTask('integ:exec:lambda:fail', {
  exec: `${cliCmd} -m integ=lambda`,
});

project.synth();