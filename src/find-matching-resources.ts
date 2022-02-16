import * as cxapi from 'aws-cdk-lib/cx-api';

export interface FindMatchingResourceOptions {
  /**
   * The Cloud Assembly to search.
   */
  readonly assembly: cxapi.CloudAssembly;

  /**
   * Patch to search for.
   */
  readonly constructPath?: string;

  /**
   * Match only the given resource types.
   */
  readonly types: string[];
}

/**
 * Finds matching resources.
 */
export function findMatchingResources(options: FindMatchingResourceOptions): MatchingResource[] {
  const {
    constructPath,
    types,
    assembly,
  } = options;

  const matches = Array<MatchingResource>();
  for (const stack of assembly.stacks) {
    const template = stack.template;

    if (typeof template.Resources !== 'object') {
      continue;
    }

    for (const [logicalId, resource] of Object.entries(template.Resources)) {
      if (typeof resource !== 'object' || resource === null) {
        continue;
      }

      const resourceRecord = resource as Record<string, any>;
      if (typeof resourceRecord.Metadata !== 'object') {
        continue;
      }

      const type = resourceRecord.Type as string;
      if (!types.some(t => t === String(type))) {
        continue;
      }

      const resourceConstructPath = resourceRecord.Metadata[cxapi.PATH_METADATA_KEY] as string;
      if (!constructPath || resourceConstructPath === constructPath || resourceConstructPath.startsWith(`${constructPath}/`)) {
        matches.push({
          logicalId,
          type,
          constructPath: resourceConstructPath,
          stackName: stack.stackName,
        });
      }
    }
  }

  return matches;
}

export interface MatchingResource {
  /**
   * Name of the stack containing the resource.
   */
  readonly stackName: string;

  /**
   * Logical ID of the resource.
   */
  readonly logicalId: string;

  /**
   * The CloudFormation type.
   */
  readonly type: string;

  /**
   * The resource's construct path metadata.
   */
  readonly constructPath: string;
}