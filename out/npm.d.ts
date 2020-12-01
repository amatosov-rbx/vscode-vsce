import { CancellationToken } from './util';
import { Manifest } from './manifest';
export interface YarnDependency {
    name: string;
    path: SourceAndDestination;
    children: YarnDependency[];
}
export interface SourceAndDestination {
    src: string;
    dest: string;
}
export declare function getDependencies(cwd: string, manifest: Manifest, useYarn?: boolean, packagedDependencies?: string[]): Promise<SourceAndDestination[]>;
export declare function getLatestVersion(name: string, cancellationToken?: CancellationToken): Promise<string>;
