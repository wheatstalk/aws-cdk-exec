const { typescript, javascript } = require('projen');

const project = new typescript.TypeScriptProject({
  defaultReleaseBranch: 'main',
  name: '@wheatstalk/aws-cdk-exec',
  authorName: 'Josh Kellendonk',
  authorEmail: 'joshkellendonk@gmail.com',
  repository: 'https://github.com/wheatstalk/aws-cdk-exec',

  releaseToNpm: true,
  npmAccess: javascript.NpmAccess.PUBLIC,

  depsUpgradeOptions: {
    ignoreProjen: false,
  },
  autoApproveUpgrades: true,
  autoApproveOptions: {
    allowedUsernames: ['misterjoshua'],
  },

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
project.addTask('integ:exec:sfn:succeed', {
  exec: `${cliCmd} integ-cdk-exec/StateMachine --input '{"succeed":true}'`,
});
project.addTask('integ:exec:sfn:fail', {
  exec: `${cliCmd} integ-cdk-exec/StateMachine`,
});
project.addTask('integ:exec:lambda:succeed', {
  exec: `${cliCmd} integ-cdk-exec/Function --input '{"succeed":true}'`,
});
project.addTask('integ:exec:lambda:fail', {
  exec: `${cliCmd} integ-cdk-exec/Function`,
});

project.synth();