import * as cxapi from 'aws-cdk-lib/cx-api';

export interface FindMatchingResourceOptionsCommon {

  /**
   * The Cloud Assembly to search.
   */
  readonly assembly: cxapi.CloudAssembly;

  /**
   * Patch to search for.
   */
  readonly constructPath?: string;

  /**
   * Metadata to search for.
   */
  readonly metadata?: MetadataMatch;

  /**
   * Tags to search for.
   */
  readonly tags?: TagsMatch;
}

export interface FindMatchingResourceOptions extends FindMatchingResourceOptionsCommon{
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
    metadata,
    tags,
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
      const resourceMetadata = resourceRecord.Metadata;
      if (typeof resourceMetadata !== 'object') {
        continue;
      }

      const type = resourceRecord.Type as string;
      if (!types.some(t => t === String(type))) {
        continue;
      }

      if (metadata && !metadata.matches(resourceMetadata)) {
        continue;
      }

      const resourceTags = resourceRecord.Properties?.Tags;
      if (tags && !tags.matches(resourceTags)) {
        continue;
      }

      const pathMetadata = resourceMetadata[cxapi.PATH_METADATA_KEY] as string;
      if (!constructPath || pathMetadata === constructPath || pathMetadata.startsWith(`${constructPath}/`)) {
        matches.push({
          logicalResourceId: logicalId,
          type,
          constructPath: pathMetadata,
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
  readonly logicalResourceId: string;

  /**
   * The CloudFormation type.
   */
  readonly type: string;

  /**
   * The resource's construct path metadata.
   */
  readonly constructPath: string;
}

/**
 * Match resource metadata with the given specification.
 */
export class MetadataMatch {
  readonly spec: Record<string, string | undefined>;

  constructor(spec: string[]) {
    this.spec = Object.fromEntries(
      spec.map(metadata => metadata.split('=', 2)),
    );
  }

  matches(resourceMetadata: Record<string, string>) {
    for (const entry of Object.entries(this.spec)) {
      const [key, value] = entry;

      if (resourceMetadata[key] === undefined) {
        return false;
      }

      if (value !== undefined && resourceMetadata[key] !== value) {
        return false;
      }
    }

    return true;
  }
}

export interface CfnTag {
  readonly Key: string;
  readonly Value: string;
}

export class TagsMatch {
  readonly spec: Record<string, string | undefined>;

  constructor(spec: string[]) {
    this.spec = Object.fromEntries(
      spec.map(metadata => metadata.split('=', 2)),
    );
  }

  matches(resourceTags?: Array<CfnTag>) {
    if (!resourceTags) {
      return false;
    }

    for (const entry of Object.entries(this.spec)) {
      const [key, value] = entry;

      const tag = resourceTags.find(t => t.Key === key);
      if (!tag) {
        return false;
      }

      if (value !== undefined && tag.Value !== value) {
        return false;
      }
    }

    return true;
  }
}