"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const path = require("path");
const fs = require("fs");
const cp = require("child_process");
const _ = require("lodash");
const findWorkspaceRoot = require("find-yarn-workspace-root");
const package_1 = require("./package");
function parseStdout({ stdout }) {
    return stdout.split(/[\r\n]/).filter(line => !!line)[0];
}
function exec(command, options = {}, cancellationToken) {
    return new Promise((c, e) => {
        let disposeCancellationListener = null;
        const child = cp.exec(command, Object.assign({}, options, { encoding: 'utf8' }), (err, stdout, stderr) => {
            if (disposeCancellationListener) {
                disposeCancellationListener();
                disposeCancellationListener = null;
            }
            if (err) {
                return e(err);
            }
            c({ stdout, stderr });
        });
        if (cancellationToken) {
            disposeCancellationListener = cancellationToken.subscribe(err => {
                child.kill();
                e(err);
            });
        }
    });
}
function checkNPM(cancellationToken) {
    return exec('npm -v', {}, cancellationToken).then(({ stdout }) => {
        const version = stdout.trim();
        if (/^3\.7\.[0123]$/.test(version)) {
            return Promise.reject(`npm@${version} doesn't work with vsce. Please update npm: npm install -g npm`);
        }
    });
}
function getNpmDependencies(cwd) {
    return checkNPM()
        .then(() => exec('npm list --production --parseable --depth=99999 --loglevel=error', { cwd, maxBuffer: 5000 * 1024 }))
        .then(({ stdout }) => stdout.split(/[\r\n]/).filter(dir => path.isAbsolute(dir))
        .map(dir => {
        return {
            src: dir,
            dest: path.relative(cwd, dir)
        };
    }));
}
function asYarnDependencies(root, rootDependencies) {
    return __awaiter(this, void 0, void 0, function* () {
        const resolve = (prefix, dependencies, collected = new Map()) => __awaiter(this, void 0, void 0, function* () {
            return yield Promise.all(dependencies
                .map((name) => __awaiter(this, void 0, void 0, function* () {
                let newPrefix = prefix, depPath = null, depManifest = null;
                while (!depManifest && root.length <= newPrefix.length) {
                    depPath = path.join(newPrefix, 'node_modules', name);
                    try {
                        depManifest = yield package_1.readNodeManifest(depPath);
                    }
                    catch (err) {
                        newPrefix = path.join(newPrefix, '..');
                        if (newPrefix.length < root.length) {
                            throw err;
                        }
                    }
                }
                const result = {
                    name,
                    path: {
                        src: depPath,
                        dest: path.relative(root, depPath),
                    },
                    children: [],
                };
                const shouldResolveChildren = !collected.has(depPath);
                collected.set(depPath, result);
                if (shouldResolveChildren) {
                    result.children = yield resolve(depPath, Object.keys(depManifest.dependencies || {}), collected);
                }
                return result;
            })));
        });
        return resolve(root, rootDependencies);
    });
}
function selectYarnDependencies(deps, packagedDependencies) {
    const index = new (class {
        constructor() {
            this.data = Object.create(null);
            for (const dep of deps) {
                if (this.data[dep.name]) {
                    throw Error(`Dependency seen more than once: ${dep.name}`);
                }
                this.data[dep.name] = dep;
            }
        }
        find(name) {
            let result = this.data[name];
            if (!result) {
                throw new Error(`Could not find dependency: ${name}`);
            }
            return result;
        }
    })();
    const reached = new (class {
        constructor() {
            this.values = [];
        }
        add(dep) {
            if (this.values.indexOf(dep) < 0) {
                this.values.push(dep);
                return true;
            }
            return false;
        }
    })();
    const visit = (name) => {
        let dep = index.find(name);
        if (!reached.add(dep)) {
            // already seen -> done
            return;
        }
        for (const child of dep.children) {
            visit(child.name);
        }
    };
    packagedDependencies.forEach(visit);
    return reached.values;
}
function getYarnProductionDependencies(root, manifest, packagedDependencies) {
    return __awaiter(this, void 0, void 0, function* () {
        const usingPackagedDependencies = Array.isArray(packagedDependencies);
        let result = yield asYarnDependencies(root, Object.keys(manifest.dependencies || {}));
        if (usingPackagedDependencies) {
            result = selectYarnDependencies(result, packagedDependencies);
        }
        return result;
    });
}
function getYarnDependencies(cwd, manifest, packagedDependencies) {
    return __awaiter(this, void 0, void 0, function* () {
        const root = findWorkspaceRoot(cwd) || cwd;
        const result = [{
                src: cwd,
                dest: ''
            }];
        if (yield new Promise(c => fs.exists(path.join(root, 'yarn.lock'), c))) {
            const deps = yield getYarnProductionDependencies(root, manifest, packagedDependencies);
            const flatten = (dep) => {
                result.push(dep.path);
                dep.children.forEach(flatten);
            };
            deps.forEach(flatten);
        }
        return _.uniqBy(result, 'src');
    });
}
function getDependencies(cwd, manifest, useYarn = false, packagedDependencies) {
    return useYarn ? getYarnDependencies(cwd, manifest, packagedDependencies) : getNpmDependencies(cwd);
}
exports.getDependencies = getDependencies;
function getLatestVersion(name, cancellationToken) {
    return checkNPM(cancellationToken)
        .then(() => exec(`npm show ${name} version`, {}, cancellationToken))
        .then(parseStdout);
}
exports.getLatestVersion = getLatestVersion;
