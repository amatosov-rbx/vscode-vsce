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
const package_1 = require("../package");
const path = require("path");
const fs = require("fs");
const assert = require("assert");
const xml2js_1 = require("xml2js");
const denodeify = require("denodeify");
const _ = require("lodash");
// don't warn in tests
console.warn = () => null;
// accept read in tests
process.env['VSCE_TESTS'] = 'true';
function throws(fn) {
    return __awaiter(this, void 0, void 0, function* () {
        let didThrow = false;
        try {
            yield fn();
        }
        catch (err) {
            didThrow = true;
        }
        if (!didThrow) {
            throw new Error('Assertion failed');
        }
    });
}
const fixture = name => path.join(path.dirname(path.dirname(__dirname)), 'src', 'test', 'fixtures', name);
const readFile = denodeify(fs.readFile);
function createXMLParser() {
    return denodeify(xml2js_1.parseString);
}
const parseXmlManifest = createXMLParser();
const parseContentTypes = createXMLParser();
function _toVsixManifest(manifest, files, options = {}) {
    const processors = package_1.createDefaultProcessors(manifest, options);
    return package_1.processFiles(processors, files).then(() => {
        const assets = _.flatten(processors.map(p => p.assets));
        const tags = _(_.flatten(processors.map(p => p.tags))).join(',');
        const vsix = processors.reduce((r, p) => (Object.assign({}, r, p.vsix)), { assets, tags });
        return package_1.toVsixManifest(vsix);
    });
}
function toXMLManifest(manifest, files = []) {
    return __awaiter(this, void 0, void 0, function* () {
        const raw = yield _toVsixManifest(manifest, files);
        return parseXmlManifest(raw);
    });
}
function assertProperty(manifest, name, value) {
    const property = manifest.PackageManifest.Metadata[0].Properties[0].Property.filter(p => p.$.Id === name);
    assert.equal(property.length, 1, `Property '${name}' should exist`);
    const enableMarketplaceQnA = property[0].$.Value;
    assert.equal(enableMarketplaceQnA, value, `Property '${name}' should have value '${value}'`);
}
function assertMissingProperty(manifest, name) {
    const property = manifest.PackageManifest.Metadata[0].Properties[0].Property.filter(p => p.$.Id === name);
    assert.equal(property.length, 0, `Property '${name}' should not exist`);
}
function createManifest(extra) {
    return Object.assign({ name: 'test', publisher: 'mocha', version: '0.0.1', description: 'test extension', engines: { vscode: '*' } }, extra);
}
describe('collect', function () {
    this.timeout(60000);
    it('should catch all files', () => {
        const cwd = fixture('uuid');
        return package_1.readManifest(cwd)
            .then(manifest => package_1.collect(manifest, { cwd }))
            .then(files => {
            assert.equal(files.length, 3);
        });
    });
    it('should ignore .git/**', () => {
        const cwd = fixture('uuid');
        if (!fs.existsSync(path.join(cwd, '.git'))) {
            fs.mkdirSync(path.join(cwd, '.git'));
        }
        if (!fs.existsSync(path.join(cwd, '.git', 'hello'))) {
            fs.writeFileSync(path.join(cwd, '.git', 'hello'), 'world');
        }
        return package_1.readManifest(cwd)
            .then(manifest => package_1.collect(manifest, { cwd }))
            .then(files => {
            assert.equal(files.length, 3);
        });
    });
    it('should ignore content of .vscodeignore', () => {
        const cwd = fixture('vscodeignore');
        return package_1.readManifest(cwd)
            .then(manifest => package_1.collect(manifest, { cwd }))
            .then(files => {
            assert.equal(files.length, 3);
        });
    });
    it('should ignore devDependencies', () => {
        const cwd = fixture('devDependencies');
        return package_1.readManifest(cwd)
            .then(manifest => package_1.collect(manifest, { cwd }))
            .then(files => {
            //   ..extension.vsixmanifest
            // [Content_Types].xml
            // extension/package.json
            // extension/node_modules/real/dependency.js
            // extension/node_modules/real/package.json
            // extension/node_modules/real2/dependency.js
            // extension/node_modules/real2/package.json
            // extension/node_modules/real_sub/dependency.js
            // extension/node_modules/real_sub/package.json
            // extension/node_modules/real/node_modules/real_sub/dependency.js
            // extension/node_modules/real/node_modules/real_sub/package.json
            assert.equal(files.length, 11);
            assert.ok(files.some(f => /real\/dependency\.js/.test(f.path)));
            assert.ok(!files.some(f => /fake\/dependency\.js/.test(f.path)));
        });
    });
    it('should ignore **/.vsixmanifest', () => {
        const cwd = fixture('vsixmanifest');
        return package_1.readManifest(cwd)
            .then(manifest => package_1.collect(manifest, { cwd }))
            .then(files => {
            assert.equal(files.filter(f => /\.vsixmanifest$/.test(f.path)).length, 1);
        });
    });
    it('should honor dependencyEntryPoints', () => {
        const cwd = fixture('packagedDependencies');
        return package_1.readManifest(cwd)
            .then(manifest => package_1.collect(manifest, { cwd, useYarn: true, dependencyEntryPoints: ['isexe'] }))
            .then(files => {
            let seenWhich;
            let seenIsexe;
            files.forEach(file => {
                seenWhich = file.path.indexOf('/node_modules/which/') >= 0;
                seenIsexe = file.path.indexOf('/node_modules/isexe/') >= 0;
            });
            assert.equal(seenWhich, false);
            assert.equal(seenIsexe, true);
        });
    });
    it('should include all node_modules when dependencyEntryPoints is not defined', () => {
        const cwd = fixture('packagedDependencies');
        return package_1.readManifest(cwd)
            .then(manifest => package_1.collect(manifest, { cwd, useYarn: true }))
            .then(files => {
            let seenWhich;
            let seenIsexe;
            files.forEach(file => {
                seenWhich = file.path.indexOf('/node_modules/which/') >= 0;
                seenIsexe = file.path.indexOf('/node_modules/isexe/') >= 0;
            });
            assert.equal(seenWhich, true);
            assert.equal(seenIsexe, true);
        });
    });
    it('should skip all node_modules when dependencyEntryPoints is []', () => {
        const cwd = fixture('packagedDependencies');
        return package_1.readManifest(cwd)
            .then(manifest => package_1.collect(manifest, { cwd, useYarn: true, dependencyEntryPoints: [] }))
            .then(files => {
            files.forEach(file => assert.ok(file.path.indexOf('/node_modules/which/') < 0, file.path));
        });
    });
    it('should collect the right files when using yarn workspaces', () => __awaiter(this, void 0, void 0, function* () {
        // PackageB will act as the extension here
        const root = fixture('yarnWorkspaces');
        const cwd = path.join(root, 'packageB');
        const manifest = yield package_1.readManifest(cwd);
        assert.equal(manifest.name, 'package-b');
        const files = yield package_1.collect(manifest, { cwd, useYarn: true });
        [
            {
                path: 'extension/main.js',
                localPath: path.resolve(cwd, 'main.js')
            },
            {
                path: 'extension/package.json',
                localPath: path.resolve(cwd, 'package.json')
            },
            {
                path: 'extension/node_modules/package-a/main.js',
                localPath: path.resolve(root, 'node_modules/package-a/main.js')
            },
            {
                path: 'extension/node_modules/package-a/package.json',
                localPath: path.resolve(root, 'node_modules/package-a/package.json')
            },
            {
                path: 'extension/node_modules/curry/curry.js',
                localPath: path.resolve(root, 'node_modules/curry/curry.js')
            },
            {
                path: 'extension/node_modules/curry/package.json',
                localPath: path.resolve(root, 'node_modules/curry/package.json')
            }
        ].forEach(expected => {
            const found = files.find(f => f.path === expected.path || f.localPath === expected.localPath);
            if (found) {
                assert.equal(found.path, expected.path, 'path');
                assert.equal(found.localPath, expected.localPath, 'localPath');
            }
        });
    }));
});
describe('readManifest', () => {
    it('should patch NLS', () => {
        const cwd = fixture('nls');
        const raw = require(path.join(cwd, 'package.json'));
        const translations = require(path.join(cwd, 'package.nls.json'));
        return package_1.readManifest(cwd).then((manifest) => {
            assert.equal(manifest.name, raw.name);
            assert.equal(manifest.description, translations['extension.description']);
            assert.equal(manifest.contributes.debuggers[0].label, translations['node.label']);
        });
    });
    it('should not patch NLS if required', () => {
        const cwd = fixture('nls');
        const raw = require(path.join(cwd, 'package.json'));
        const translations = require(path.join(cwd, 'package.nls.json'));
        return package_1.readManifest(cwd, false).then((manifest) => {
            assert.equal(manifest.name, raw.name);
            assert.notEqual(manifest.description, translations['extension.description']);
            assert.notEqual(manifest.contributes.debuggers[0].label, translations['node.label']);
        });
    });
});
describe('validateManifest', () => {
    it('should catch missing fields', () => {
        assert(package_1.validateManifest({ publisher: 'demo', name: 'demo', version: '1.0.0', engines: { vscode: '0.10.1' } }));
        assert.throws(() => {
            package_1.validateManifest({ publisher: null, name: 'demo', version: '1.0.0', engines: { vscode: '0.10.1' } });
        });
        assert.throws(() => {
            package_1.validateManifest({ publisher: 'demo', name: null, version: '1.0.0', engines: { vscode: '0.10.1' } });
        });
        assert.throws(() => {
            package_1.validateManifest({ publisher: 'demo', name: 'demo', version: null, engines: { vscode: '0.10.1' } });
        });
        assert.throws(() => {
            package_1.validateManifest({ publisher: 'demo', name: 'demo', version: '1.0', engines: { vscode: '0.10.1' } });
        });
        assert.throws(() => {
            package_1.validateManifest({ publisher: 'demo', name: 'demo', version: '1.0.0', engines: null });
        });
        assert.throws(() => {
            package_1.validateManifest({ publisher: 'demo', name: 'demo', version: '1.0.0', engines: { vscode: null } });
        });
    });
    it('should prevent SVG icons', () => {
        assert(package_1.validateManifest(createManifest({ icon: 'icon.png' })));
        assert.throws(() => {
            package_1.validateManifest(createManifest({ icon: 'icon.svg' }));
        });
    });
    it('should prevent badges from non HTTPS sources', () => {
        assert.throws(() => {
            package_1.validateManifest(createManifest({ badges: [{ url: 'relative.png', href: 'http://badgeurl', description: 'this is a badge' }] }));
        });
        assert.throws(() => {
            package_1.validateManifest(createManifest({ badges: [{ url: 'relative.svg', href: 'http://badgeurl', description: 'this is a badge' }] }));
        });
        assert.throws(() => {
            package_1.validateManifest(createManifest({
                badges: [{ url: 'http://badgeurl.png', href: 'http://badgeurl', description: 'this is a badge' }],
            }));
        });
    });
    it('should allow non SVG badges', () => {
        assert(package_1.validateManifest(createManifest({
            badges: [{ url: 'https://host/badge.png', href: 'http://badgeurl', description: 'this is a badge' }],
        })));
    });
    it('should allow SVG badges from trusted sources', () => {
        assert(package_1.validateManifest(createManifest({
            badges: [{ url: 'https://gemnasium.com/foo.svg', href: 'http://badgeurl', description: 'this is a badge' }],
        })));
    });
    it('should prevent SVG badges from non trusted sources', () => {
        assert.throws(() => {
            assert(package_1.validateManifest(createManifest({
                badges: [{ url: 'https://github.com/foo.svg', href: 'http://badgeurl', description: 'this is a badge' }],
            })));
        });
        assert.throws(() => {
            assert(package_1.validateManifest(createManifest({
                badges: [
                    {
                        url: 'https://dev.w3.org/SVG/tools/svgweb/samples/svg-files/410.sv%67',
                        href: 'http://badgeurl',
                        description: 'this is a badge',
                    },
                ],
            })));
        });
    });
});
describe('toVsixManifest', () => {
    it('should produce a good xml', () => {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            description: 'test extension',
            engines: Object.create(null),
        };
        return _toVsixManifest(manifest, [])
            .then(parseXmlManifest)
            .then(result => {
            assert.ok(result);
            assert.ok(result.PackageManifest);
            assert.ok(result.PackageManifest.$);
            assert.equal(result.PackageManifest.$.Version, '2.0.0');
            assert.equal(result.PackageManifest.$.xmlns, 'http://schemas.microsoft.com/developer/vsx-schema/2011');
            assert.equal(result.PackageManifest.$['xmlns:d'], 'http://schemas.microsoft.com/developer/vsx-schema-design/2011');
            assert.ok(result.PackageManifest.Metadata);
            assert.equal(result.PackageManifest.Metadata.length, 1);
            assert.equal(result.PackageManifest.Metadata[0].Description[0]._, 'test extension');
            assert.equal(result.PackageManifest.Metadata[0].DisplayName[0], 'test');
            assert.equal(result.PackageManifest.Metadata[0].Identity[0].$.Id, 'test');
            assert.equal(result.PackageManifest.Metadata[0].Identity[0].$.Version, '0.0.1');
            assert.equal(result.PackageManifest.Metadata[0].Identity[0].$.Publisher, 'mocha');
            assert.deepEqual(result.PackageManifest.Metadata[0].Tags, ['']);
            assert.deepEqual(result.PackageManifest.Metadata[0].GalleryFlags, ['Public']);
            assert.equal(result.PackageManifest.Installation.length, 1);
            assert.equal(result.PackageManifest.Installation[0].InstallationTarget.length, 1);
            assert.equal(result.PackageManifest.Installation[0].InstallationTarget[0].$.Id, 'Microsoft.VisualStudio.Code');
            assert.deepEqual(result.PackageManifest.Dependencies, ['']);
            assert.equal(result.PackageManifest.Assets.length, 1);
            assert.equal(result.PackageManifest.Assets[0].Asset.length, 1);
            assert.equal(result.PackageManifest.Assets[0].Asset[0].$.Type, 'Microsoft.VisualStudio.Code.Manifest');
            assert.equal(result.PackageManifest.Assets[0].Asset[0].$.Path, 'extension/package.json');
        });
    });
    it('should escape special characters', () => {
        const specialCharacters = '\'"<>&`';
        const name = `name${specialCharacters}`;
        const publisher = `publisher${specialCharacters}`;
        const version = `version${specialCharacters}`;
        const description = `description${specialCharacters}`;
        const manifest = {
            name,
            publisher,
            version,
            description,
            engines: Object.create(null),
        };
        return _toVsixManifest(manifest, [])
            .then(xml => parseXmlManifest(xml))
            .then(result => {
            assert.equal(result.PackageManifest.Metadata[0].Identity[0].$.Version, version);
            assert.equal(result.PackageManifest.Metadata[0].Identity[0].$.Publisher, publisher);
            assert.equal(result.PackageManifest.Metadata[0].DisplayName[0], name);
            assert.equal(result.PackageManifest.Metadata[0].Description[0]._, description);
        });
    });
    it('should treat README.md as asset', () => {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            description: 'test extension',
            engines: Object.create(null),
        };
        const files = [{ path: 'extension/readme.md', contents: Buffer.from('') }];
        return _toVsixManifest(manifest, files)
            .then(xml => parseXmlManifest(xml))
            .then(result => {
            assert.equal(result.PackageManifest.Assets[0].Asset.length, 2);
            assert.equal(result.PackageManifest.Assets[0].Asset[1].$.Type, 'Microsoft.VisualStudio.Services.Content.Details');
            assert.equal(result.PackageManifest.Assets[0].Asset[1].$.Path, 'extension/readme.md');
        });
    });
    it('should treat CHANGELOG.md as asset', () => {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            description: 'test extension',
            engines: Object.create(null),
        };
        const files = [{ path: 'extension/changelog.md', contents: Buffer.from('') }];
        return _toVsixManifest(manifest, files)
            .then(xml => parseXmlManifest(xml))
            .then(result => {
            assert.equal(result.PackageManifest.Assets[0].Asset.length, 2);
            assert.equal(result.PackageManifest.Assets[0].Asset[1].$.Type, 'Microsoft.VisualStudio.Services.Content.Changelog');
            assert.equal(result.PackageManifest.Assets[0].Asset[1].$.Path, 'extension/changelog.md');
        });
    });
    it('should respect display name', () => {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            displayName: 'Test Extension',
            engines: Object.create(null),
        };
        return _toVsixManifest(manifest, [])
            .then(xml => parseXmlManifest(xml))
            .then(result => {
            assert.equal(result.PackageManifest.Metadata[0].Identity[0].$.Id, 'test');
            assert.equal(result.PackageManifest.Metadata[0].DisplayName[0], 'Test Extension');
        });
    });
    it('should treat any license file as asset', () => {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            description: 'test extension',
            license: 'SEE LICENSE IN thelicense.md',
            engines: Object.create(null),
        };
        const files = [{ path: 'extension/thelicense.md', contents: '' }];
        return _toVsixManifest(manifest, files)
            .then(xml => parseXmlManifest(xml))
            .then(result => {
            assert.equal(result.PackageManifest.Assets[0].Asset.length, 2);
            assert.equal(result.PackageManifest.Assets[0].Asset[1].$.Type, 'Microsoft.VisualStudio.Services.Content.License');
            assert.equal(result.PackageManifest.Assets[0].Asset[1].$.Path, 'extension/thelicense.md');
        });
    });
    it('should add a license metadata tag', () => {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            description: 'test extension',
            license: 'SEE LICENSE IN thelicense.md',
            engines: Object.create(null),
        };
        const files = [{ path: 'extension/thelicense.md', contents: '' }];
        return _toVsixManifest(manifest, files)
            .then(xml => parseXmlManifest(xml))
            .then(result => {
            assert.ok(result.PackageManifest.Metadata[0].License);
            assert.equal(result.PackageManifest.Metadata[0].License.length, 1);
            assert.equal(result.PackageManifest.Metadata[0].License[0], 'extension/thelicense.md');
        });
    });
    it('should automatically detect license files', () => {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            description: 'test extension',
            engines: Object.create(null),
        };
        const files = [{ path: 'extension/LICENSE.md', contents: '' }];
        return _toVsixManifest(manifest, files)
            .then(xml => parseXmlManifest(xml))
            .then(result => {
            assert.ok(result.PackageManifest.Metadata[0].License);
            assert.equal(result.PackageManifest.Metadata[0].License.length, 1);
            assert.equal(result.PackageManifest.Metadata[0].License[0], 'extension/LICENSE.md');
            assert.equal(result.PackageManifest.Assets[0].Asset.length, 2);
            assert.equal(result.PackageManifest.Assets[0].Asset[1].$.Type, 'Microsoft.VisualStudio.Services.Content.License');
            assert.equal(result.PackageManifest.Assets[0].Asset[1].$.Path, 'extension/LICENSE.md');
        });
    });
    it('should add an icon metadata tag', () => {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            description: 'test extension',
            engines: Object.create(null),
            icon: 'fake.png',
            license: 'SEE LICENSE IN thelicense.md',
        };
        const files = [
            { path: 'extension/fake.png', contents: '' },
            { path: 'extension/thelicense.md', contents: '' },
        ];
        return _toVsixManifest(manifest, files)
            .then(xml => parseXmlManifest(xml))
            .then(result => {
            assert.ok(result.PackageManifest.Metadata[0].Icon);
            assert.equal(result.PackageManifest.Metadata[0].Icon.length, 1);
            assert.equal(result.PackageManifest.Metadata[0].Icon[0], 'extension/fake.png');
            assert.equal(result.PackageManifest.Metadata[0].License[0], 'extension/thelicense.md');
        });
    });
    it('should add an icon asset', () => {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            description: 'test extension',
            engines: Object.create(null),
            icon: 'fake.png',
        };
        const files = [{ path: 'extension/fake.png', contents: '' }];
        return _toVsixManifest(manifest, files)
            .then(xml => parseXmlManifest(xml))
            .then(result => {
            assert.ok(result.PackageManifest.Assets[0].Asset.some(d => d.$.Type === 'Microsoft.VisualStudio.Services.Icons.Default' && d.$.Path === 'extension/fake.png'));
        });
    });
    it('should add asset with win path', () => {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            description: 'test extension',
            engines: Object.create(null),
            icon: 'fake.png',
            license: 'SEE LICENSE IN thelicense.md',
        };
        const files = [
            { path: 'extension\\fake.png', contents: '' },
            { path: 'extension\\thelicense.md', contents: '' },
        ];
        return _toVsixManifest(manifest, files)
            .then(xml => parseXmlManifest(xml))
            .then(result => {
            assert.ok(result.PackageManifest.Metadata[0].Icon);
            assert.equal(result.PackageManifest.Metadata[0].Icon.length, 1);
            assert.equal(result.PackageManifest.Metadata[0].Icon[0], 'extension/fake.png');
            assert.equal(result.PackageManifest.Metadata[0].License[0], 'extension/thelicense.md');
        });
    });
    it('should understand gallery color and theme', () => {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            engines: Object.create(null),
            galleryBanner: {
                color: '#5c2d91',
                theme: 'dark',
            },
        };
        return _toVsixManifest(manifest, [])
            .then(xml => parseXmlManifest(xml))
            .then(result => {
            const properties = result.PackageManifest.Metadata[0].Properties[0].Property.map(p => p.$);
            assert.ok(properties.some(p => p.Id === 'Microsoft.VisualStudio.Services.Branding.Color' && p.Value === '#5c2d91'));
            assert.ok(properties.some(p => p.Id === 'Microsoft.VisualStudio.Services.Branding.Theme' && p.Value === 'dark'));
        });
    });
    it('should understand all link types', () => {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            engines: Object.create(null),
            repository: {
                type: 'git',
                url: 'https://server.com/Microsoft/vscode-spell-check.git',
            },
            bugs: {
                url: 'https://server.com/Microsoft/vscode-spell-check/issues',
            },
            homepage: 'https://server.com/Microsoft/vscode-spell-check',
        };
        return _toVsixManifest(manifest, [])
            .then(xml => parseXmlManifest(xml))
            .then(result => {
            const properties = result.PackageManifest.Metadata[0].Properties[0].Property.map(p => p.$);
            assert.ok(properties.some(p => p.Id === 'Microsoft.VisualStudio.Services.Links.Source' &&
                p.Value === 'https://server.com/Microsoft/vscode-spell-check.git'));
            assert.ok(properties.some(p => p.Id === 'Microsoft.VisualStudio.Services.Links.Getstarted' &&
                p.Value === 'https://server.com/Microsoft/vscode-spell-check.git'));
            assert.ok(properties.some(p => p.Id === 'Microsoft.VisualStudio.Services.Links.Repository' &&
                p.Value === 'https://server.com/Microsoft/vscode-spell-check.git'));
            assert.ok(properties.some(p => p.Id === 'Microsoft.VisualStudio.Services.Links.Support' &&
                p.Value === 'https://server.com/Microsoft/vscode-spell-check/issues'));
            assert.ok(properties.some(p => p.Id === 'Microsoft.VisualStudio.Services.Links.Learn' &&
                p.Value === 'https://server.com/Microsoft/vscode-spell-check'));
        });
    });
    it('should detect github repositories', () => {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            engines: Object.create(null),
            repository: {
                type: 'git',
                url: 'https://github.com/Microsoft/vscode-spell-check.git',
            },
        };
        return _toVsixManifest(manifest, [])
            .then(xml => parseXmlManifest(xml))
            .then(result => {
            const properties = result.PackageManifest.Metadata[0].Properties[0].Property.map(p => p.$);
            assert.ok(properties.some(p => p.Id === 'Microsoft.VisualStudio.Services.Links.GitHub' &&
                p.Value === 'https://github.com/Microsoft/vscode-spell-check.git'));
            assert.ok(properties.every(p => p.Id !== 'Microsoft.VisualStudio.Services.Links.Repository'));
        });
    });
    it('should detect short github repositories', () => {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            engines: Object.create(null),
            repository: 'Microsoft/vscode-spell-check',
        };
        return _toVsixManifest(manifest, [])
            .then(xml => parseXmlManifest(xml))
            .then(result => {
            const properties = result.PackageManifest.Metadata[0].Properties[0].Property.map(p => p.$);
            assert.ok(properties.some(p => p.Id === 'Microsoft.VisualStudio.Services.Links.GitHub' &&
                p.Value === 'https://github.com/Microsoft/vscode-spell-check.git'));
            assert.ok(properties.every(p => p.Id !== 'Microsoft.VisualStudio.Services.Links.Repository'));
        });
    });
    it('should understand categories', () => {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            engines: Object.create(null),
            categories: ['hello', 'world'],
        };
        return _toVsixManifest(manifest, [])
            .then(xml => parseXmlManifest(xml))
            .then(result => {
            const categories = result.PackageManifest.Metadata[0].Categories[0].split(',');
            assert.ok(categories.some(c => c === 'hello'));
            assert.ok(categories.some(c => c === 'world'));
        });
    });
    it('should respect preview flag', () => {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            engines: Object.create(null),
            preview: true,
        };
        return _toVsixManifest(manifest, [])
            .then(xml => parseXmlManifest(xml))
            .then(result => {
            assert.deepEqual(result.PackageManifest.Metadata[0].GalleryFlags, ['Public Preview']);
        });
    });
    it('should automatically add theme tag for color themes', () => {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            engines: Object.create(null),
            contributes: {
                themes: [{ label: 'monokai', uiTheme: 'vs', path: 'monokai.tmTheme' }],
            },
        };
        return _toVsixManifest(manifest, [])
            .then(parseXmlManifest)
            .then(result => {
            const tags = result.PackageManifest.Metadata[0].Tags[0].split(',');
            assert(tags.some(tag => tag === 'theme'));
        });
    });
    it('should not automatically add theme tag when themes are empty', () => {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            engines: Object.create(null),
            contributes: {
                themes: [],
            },
        };
        return _toVsixManifest(manifest, [])
            .then(parseXmlManifest)
            .then(result => assert.deepEqual(result.PackageManifest.Metadata[0].Tags[0], ''));
    });
    it('should automatically add color-theme tag', () => {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            engines: Object.create(null),
            contributes: {
                themes: [{ label: 'monokai', uiTheme: 'vs', path: 'monokai.tmTheme' }],
            },
        };
        return _toVsixManifest(manifest, [])
            .then(parseXmlManifest)
            .then(result => {
            const tags = result.PackageManifest.Metadata[0].Tags[0].split(',');
            assert(tags.some(tag => tag === 'color-theme'));
        });
    });
    it('should automatically add theme tag for icon themes', () => {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            engines: Object.create(null),
            contributes: {
                iconThemes: [{ id: 'fakeicons', label: 'fakeicons', path: 'fake.icons' }],
            },
        };
        return _toVsixManifest(manifest, [])
            .then(parseXmlManifest)
            .then(result => {
            const tags = result.PackageManifest.Metadata[0].Tags[0].split(',');
            assert(tags.some(tag => tag === 'theme'));
        });
    });
    it('should automatically add icon-theme tag', () => {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            engines: Object.create(null),
            contributes: {
                iconThemes: [{ id: 'fakeicons', label: 'fakeicons', path: 'fake.icons' }],
            },
        };
        return _toVsixManifest(manifest, [])
            .then(parseXmlManifest)
            .then(result => {
            const tags = result.PackageManifest.Metadata[0].Tags[0].split(',');
            assert(tags.some(tag => tag === 'icon-theme'));
        });
    });
    it('should automatically add language tag with activationEvent', () => {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            engines: Object.create(null),
            activationEvents: ['onLanguage:go'],
        };
        return _toVsixManifest(manifest, [])
            .then(parseXmlManifest)
            .then(result => assert.deepEqual(result.PackageManifest.Metadata[0].Tags[0], 'go'));
    });
    it('should automatically add language tag with language contribution', () => {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            engines: Object.create(null),
            contributes: {
                languages: [{ id: 'go' }],
            },
        };
        return _toVsixManifest(manifest, [])
            .then(parseXmlManifest)
            .then(result => assert.deepEqual(result.PackageManifest.Metadata[0].Tags[0], 'go'));
    });
    it('should automatically add snippets tag', () => {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            engines: Object.create(null),
            contributes: {
                snippets: [{ language: 'go', path: 'gosnippets.json' }],
            },
        };
        return _toVsixManifest(manifest, [])
            .then(parseXmlManifest)
            .then(result => assert.deepEqual(result.PackageManifest.Metadata[0].Tags[0], 'snippet'));
    });
    it('should remove duplicate tags', () => {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            engines: Object.create(null),
            keywords: ['theme', 'theme'],
        };
        return _toVsixManifest(manifest, [])
            .then(parseXmlManifest)
            .then(result => assert.deepEqual(result.PackageManifest.Metadata[0].Tags[0], 'theme'));
    });
    it('should detect keybindings', () => {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            engines: Object.create(null),
            contributes: {
                keybindings: [{ command: 'hello', key: 'ctrl+f1' }],
            },
        };
        return _toVsixManifest(manifest, [])
            .then(parseXmlManifest)
            .then(result => {
            const tags = result.PackageManifest.Metadata[0].Tags[0].split(',');
            assert(tags.some(tag => tag === 'keybindings'));
        });
    });
    it('should detect debuggers', () => {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            engines: Object.create(null),
            contributes: {
                debuggers: [
                    {
                        type: 'node',
                        label: 'Node Debug',
                        program: './out/node/nodeDebug.js',
                        runtime: 'node',
                        enableBreakpointsFor: { languageIds: ['javascript', 'javascriptreact'] },
                    },
                ],
            },
        };
        return _toVsixManifest(manifest, [])
            .then(parseXmlManifest)
            .then(result => {
            const tags = result.PackageManifest.Metadata[0].Tags[0].split(',');
            assert(tags.some(tag => tag === 'debuggers'));
        });
    });
    it('should detect json validation rules', () => {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            engines: Object.create(null),
            contributes: {
                jsonValidation: [
                    {
                        fileMatch: '.jshintrc',
                        url: 'http://json.schemastore.org/jshintrc',
                    },
                ],
            },
        };
        return _toVsixManifest(manifest, [])
            .then(parseXmlManifest)
            .then(result => {
            const tags = result.PackageManifest.Metadata[0].Tags[0].split(',');
            assert(tags.some(tag => tag === 'json'));
        });
    });
    it('should detect keywords in description', () => {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            engines: Object.create(null),
            description: 'This C++ extension likes combines ftp with javascript',
        };
        return _toVsixManifest(manifest, [])
            .then(parseXmlManifest)
            .then(result => {
            const tags = result.PackageManifest.Metadata[0].Tags[0].split(',');
            assert(tags.some(tag => tag === 'c++'), 'detect c++');
            assert(tags.some(tag => tag === 'ftp'), 'detect ftp');
            assert(tags.some(tag => tag === 'javascript'), 'detect javascript');
            assert(!_.includes(tags, 'java'), "don't detect java");
        });
    });
    it('should detect language grammars', () => {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            engines: Object.create(null),
            contributes: {
                grammars: [
                    {
                        language: 'shellscript',
                        scopeName: 'source.shell',
                        path: './syntaxes/Shell-Unix-Bash.tmLanguage',
                    },
                ],
            },
        };
        return _toVsixManifest(manifest, [])
            .then(parseXmlManifest)
            .then(result => {
            const tags = result.PackageManifest.Metadata[0].Tags[0].split(',');
            assert(tags.some(tag => tag === 'shellscript'));
        });
    });
    it('should detect language aliases', () => {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            engines: Object.create(null),
            contributes: {
                languages: [
                    {
                        id: 'go',
                        aliases: ['golang', 'google-go'],
                    },
                ],
            },
        };
        return _toVsixManifest(manifest, [])
            .then(parseXmlManifest)
            .then(result => {
            const tags = result.PackageManifest.Metadata[0].Tags[0].split(',');
            assert(tags.some(tag => tag === 'go'));
            assert(tags.some(tag => tag === 'golang'));
            assert(tags.some(tag => tag === 'google-go'));
        });
    });
    it('should detect localization contributions', () => {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            engines: Object.create(null),
            contributes: {
                localizations: [
                    {
                        languageId: 'de',
                        translations: [
                            { id: 'vscode', path: 'fake.json' },
                            { id: 'vscode.go', path: 'what.json' },
                        ],
                    },
                ],
            },
        };
        return _toVsixManifest(manifest, [])
            .then(parseXmlManifest)
            .then(result => {
            const tags = result.PackageManifest.Metadata[0].Tags[0].split(',');
            assert(tags.some(tag => tag === 'lp-de'));
            assert(tags.some(tag => tag === '__lp_vscode'));
            assert(tags.some(tag => tag === '__lp-de_vscode'));
            assert(tags.some(tag => tag === '__lp_vscode.go'));
            assert(tags.some(tag => tag === '__lp-de_vscode.go'));
        });
    });
    it('should expose localization contributions as assets', () => {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            engines: Object.create(null),
            contributes: {
                localizations: [
                    {
                        languageId: 'de',
                        languageName: 'German',
                        translations: [
                            { id: 'vscode', path: 'de.json' },
                            { id: 'vscode.go', path: 'what.json' },
                        ],
                    },
                    {
                        languageId: 'pt',
                        languageName: 'Portuguese',
                        localizedLanguageName: 'Português',
                        translations: [{ id: 'vscode', path: './translations/pt.json' }],
                    },
                ],
            },
        };
        const files = [
            { path: 'extension/de.json', contents: Buffer.from('') },
            { path: 'extension/translations/pt.json', contents: Buffer.from('') },
        ];
        return _toVsixManifest(manifest, files)
            .then(parseXmlManifest)
            .then(result => {
            const assets = result.PackageManifest.Assets[0].Asset;
            assert(assets.some(asset => asset.$.Type === 'Microsoft.VisualStudio.Code.Translation.DE' && asset.$.Path === 'extension/de.json'));
            assert(assets.some(asset => asset.$.Type === 'Microsoft.VisualStudio.Code.Translation.PT' &&
                asset.$.Path === 'extension/translations/pt.json'));
            const properties = result.PackageManifest.Metadata[0].Properties[0].Property;
            const localizedLangProp = properties.filter(p => p.$.Id === 'Microsoft.VisualStudio.Code.LocalizedLanguages');
            assert.equal(localizedLangProp.length, 1);
            const localizedLangs = localizedLangProp[0].$.Value.split(',');
            assert.equal(localizedLangs.length, 2);
            assert.equal(localizedLangs[0], 'German');
            assert.equal(localizedLangs[1], 'Português');
        });
    });
    it('should detect language extensions', () => {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            engines: Object.create(null),
            contributes: {
                languages: [
                    {
                        id: 'go',
                        extensions: ['go', 'golang'],
                    },
                ],
            },
        };
        return _toVsixManifest(manifest, [])
            .then(parseXmlManifest)
            .then(result => {
            const tags = result.PackageManifest.Metadata[0].Tags[0].split(',');
            assert(tags.some(tag => tag === '__ext_go'));
            assert(tags.some(tag => tag === '__ext_golang'));
        });
    });
    it('should detect and sanitize language extensions', () => {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            engines: Object.create(null),
            contributes: {
                languages: [
                    {
                        id: 'go',
                        extensions: ['.go'],
                    },
                ],
            },
        };
        return _toVsixManifest(manifest, [])
            .then(parseXmlManifest)
            .then(result => {
            const tags = result.PackageManifest.Metadata[0].Tags[0].split(',');
            assert(tags.some(tag => tag === '__ext_go'));
        });
    });
    it('should understand badges', () => {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            engines: Object.create(null),
            badges: [
                { url: 'http://badgeurl.png', href: 'http://badgeurl', description: 'this is a badge' },
                { url: 'http://anotherbadgeurl.png', href: 'http://anotherbadgeurl', description: 'this is another badge' },
            ],
        };
        return _toVsixManifest(manifest, [])
            .then(xml => parseXmlManifest(xml))
            .then(result => {
            const badges = result.PackageManifest.Metadata[0].Badges[0].Badge;
            assert.equal(badges.length, 2);
            assert.equal(badges[0].$.Link, 'http://badgeurl');
            assert.equal(badges[0].$.ImgUri, 'http://badgeurl.png');
            assert.equal(badges[0].$.Description, 'this is a badge');
            assert.equal(badges[1].$.Link, 'http://anotherbadgeurl');
            assert.equal(badges[1].$.ImgUri, 'http://anotherbadgeurl.png');
            assert.equal(badges[1].$.Description, 'this is another badge');
        });
    });
    it('should not have empty keywords #114', () => {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            engines: Object.create(null),
            contributes: {
                grammars: [
                    {
                        language: 'javascript',
                        scopeName: 'source.js.jsx',
                        path: './syntaxes/Babel Language.json',
                    },
                    {
                        scopeName: 'source.regexp.babel',
                        path: './syntaxes/Babel Regex.json',
                    },
                ],
            },
        };
        return _toVsixManifest(manifest, [])
            .then(parseXmlManifest)
            .then(result => {
            const tags = result.PackageManifest.Metadata[0].Tags[0].split(',');
            tags.forEach(tag => assert(tag, `Found empty tag '${tag}'.`));
        });
    });
    it('should use engine as a version property', () => {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            description: 'test extension',
            engines: { vscode: '^1.0.0' },
        };
        return _toVsixManifest(manifest, [])
            .then(parseXmlManifest)
            .then(result => {
            const properties = result.PackageManifest.Metadata[0].Properties[0].Property;
            const engineProperties = properties.filter(p => p.$.Id === 'Microsoft.VisualStudio.Code.Engine');
            assert.equal(engineProperties.length, 1);
            const engine = engineProperties[0].$.Value;
            assert.equal(engine, '^1.0.0');
        });
    });
    it('should use github markdown by default', () => {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            description: 'test extension',
            engines: Object.create(null),
        };
        return _toVsixManifest(manifest, [])
            .then(parseXmlManifest)
            .then(result => {
            const properties = result.PackageManifest.Metadata[0].Properties[0].Property;
            assert(properties.some(p => p.$.Id === 'Microsoft.VisualStudio.Services.GitHubFlavoredMarkdown' && p.$.Value === 'true'));
        });
    });
    it('should understand the markdown property', () => {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            description: 'test extension',
            markdown: 'standard',
            engines: Object.create(null),
        };
        return _toVsixManifest(manifest, [])
            .then(parseXmlManifest)
            .then(result => {
            const properties = result.PackageManifest.Metadata[0].Properties[0].Property;
            assert(properties.some(p => p.$.Id === 'Microsoft.VisualStudio.Services.GitHubFlavoredMarkdown' && p.$.Value === 'false'));
        });
    });
    it('should ignore unknown markdown properties', () => {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            description: 'test extension',
            markdown: 'wow',
            engines: Object.create(null),
        };
        return _toVsixManifest(manifest, [])
            .then(parseXmlManifest)
            .then(result => {
            const properties = result.PackageManifest.Metadata[0].Properties[0].Property;
            assert(properties.some(p => p.$.Id === 'Microsoft.VisualStudio.Services.GitHubFlavoredMarkdown' && p.$.Value === 'true'));
        });
    });
    it('should add extension dependencies property', () => {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            description: 'test extension',
            engines: Object.create(null),
            extensionDependencies: ['foo.bar', 'foo.bar', 'monkey.hello'],
        };
        return _toVsixManifest(manifest, [])
            .then(parseXmlManifest)
            .then(result => {
            const properties = result.PackageManifest.Metadata[0].Properties[0].Property;
            const dependenciesProp = properties.filter(p => p.$.Id === 'Microsoft.VisualStudio.Code.ExtensionDependencies');
            assert.equal(dependenciesProp.length, 1);
            const dependencies = dependenciesProp[0].$.Value.split(',');
            assert.equal(dependencies.length, 2);
            assert(dependencies.some(d => d === 'foo.bar'));
            assert(dependencies.some(d => d === 'monkey.hello'));
        });
    });
    it('should error with files with same case insensitive name', () => __awaiter(this, void 0, void 0, function* () {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            description: 'test extension',
            engines: Object.create(null),
        };
        const files = [
            { path: 'extension/file.txt', contents: '' },
            { path: 'extension/FILE.txt', contents: '' },
        ];
        try {
            yield _toVsixManifest(manifest, files);
        }
        catch (err) {
            assert(/have the same case insensitive path/i.test(err.message));
            return;
        }
        throw new Error('Should not reach here');
    }));
    it('should expose web extension assets and properties', () => __awaiter(this, void 0, void 0, function* () {
        const manifest = createManifest({
            browser: 'browser.js',
            extensionKind: ['web'],
        });
        const files = [{ path: 'extension/browser.js', contents: Buffer.from('') }];
        const vsixManifest = yield _toVsixManifest(manifest, files, { web: true });
        const result = yield parseXmlManifest(vsixManifest);
        const assets = result.PackageManifest.Assets[0].Asset;
        assert(assets.some(asset => asset.$.Type === 'Microsoft.VisualStudio.Code.WebResources/extension/browser.js' &&
            asset.$.Path === 'extension/browser.js'));
        const properties = result.PackageManifest.Metadata[0].Properties[0].Property;
        const webExtensionProps = properties.filter(p => p.$.Id === 'Microsoft.VisualStudio.Code.WebExtension');
        assert.equal(webExtensionProps.length, 1);
        assert.equal(webExtensionProps[0].$.Value, 'true');
    }));
    it('should expose web extension assets and properties when extension kind is not provided', () => __awaiter(this, void 0, void 0, function* () {
        const manifest = createManifest({
            browser: 'browser.js',
        });
        const files = [{ path: 'extension/browser.js', contents: Buffer.from('') }];
        const vsixManifest = yield _toVsixManifest(manifest, files, { web: true });
        const result = yield parseXmlManifest(vsixManifest);
        const assets = result.PackageManifest.Assets[0].Asset;
        assert(assets.some(asset => asset.$.Type === 'Microsoft.VisualStudio.Code.WebResources/extension/browser.js' &&
            asset.$.Path === 'extension/browser.js'));
        const properties = result.PackageManifest.Metadata[0].Properties[0].Property;
        const webExtensionProps = properties.filter(p => p.$.Id === 'Microsoft.VisualStudio.Code.WebExtension');
        assert.equal(webExtensionProps.length, 1);
        assert.equal(webExtensionProps[0].$.Value, 'true');
    }));
    it('should not expose web extension assets and properties for web extension when not asked for', () => __awaiter(this, void 0, void 0, function* () {
        const manifest = createManifest({
            browser: 'browser.js',
            extensionKind: ['web'],
        });
        const files = [{ path: 'extension/browser.js', contents: Buffer.from('') }];
        const vsixManifest = yield _toVsixManifest(manifest, files);
        const result = yield parseXmlManifest(vsixManifest);
        const assets = result.PackageManifest.Assets[0].Asset;
        assert(assets.every(asset => !asset.$.Type.startsWith('Microsoft.VisualStudio.Code.WebResources')));
        const properties = result.PackageManifest.Metadata[0].Properties[0].Property;
        const webExtensionProps = properties.filter(p => p.$.Id === 'Microsoft.VisualStudio.Code.WebExtension');
        assert.equal(webExtensionProps.length, 0);
    }));
    it('should not expose web extension assets and properties for non web extension', () => __awaiter(this, void 0, void 0, function* () {
        const manifest = createManifest({
            main: 'main.js',
        });
        const files = [{ path: 'extension/main.js', contents: Buffer.from('') }];
        const vsixManifest = yield _toVsixManifest(manifest, files, { web: true });
        const result = yield parseXmlManifest(vsixManifest);
        const assets = result.PackageManifest.Assets[0].Asset;
        assert(assets.every(asset => !asset.$.Type.startsWith('Microsoft.VisualStudio.Code.WebResources')));
        const properties = result.PackageManifest.Metadata[0].Properties[0].Property;
        const webExtensionProps = properties.filter(p => p.$.Id === 'Microsoft.VisualStudio.Code.WebExtension');
        assert.equal(webExtensionProps.length, 0);
    }));
    it('should expose extension kind properties when providedd', () => __awaiter(this, void 0, void 0, function* () {
        const manifest = createManifest({
            extensionKind: ['ui', 'workspace', 'web'],
        });
        const files = [{ path: 'extension/main.js', contents: Buffer.from('') }];
        const vsixManifest = yield _toVsixManifest(manifest, files, { web: true });
        const result = yield parseXmlManifest(vsixManifest);
        const properties = result.PackageManifest.Metadata[0].Properties[0].Property;
        const extensionKindProps = properties.filter(p => p.$.Id === 'Microsoft.VisualStudio.Code.ExtensionKind');
        assert.equal(extensionKindProps[0].$.Value, ['ui', 'workspace', 'web'].join(','));
    }));
    it('should expose extension kind properties when derived', () => __awaiter(this, void 0, void 0, function* () {
        const manifest = createManifest({
            main: 'main.js',
        });
        const files = [{ path: 'extension/main.js', contents: Buffer.from('') }];
        const vsixManifest = yield _toVsixManifest(manifest, files, { web: true });
        const result = yield parseXmlManifest(vsixManifest);
        const properties = result.PackageManifest.Metadata[0].Properties[0].Property;
        const extensionKindProps = properties.filter(p => p.$.Id === 'Microsoft.VisualStudio.Code.ExtensionKind');
        assert.equal(extensionKindProps[0].$.Value, 'workspace');
    }));
});
describe('qna', () => {
    it('should use marketplace qna by default', () => __awaiter(this, void 0, void 0, function* () {
        const xmlManifest = yield toXMLManifest({
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            engines: Object.create(null),
        });
        assertMissingProperty(xmlManifest, 'Microsoft.VisualStudio.Services.EnableMarketplaceQnA');
        assertMissingProperty(xmlManifest, 'Microsoft.VisualStudio.Services.CustomerQnALink');
    }));
    it('should not use marketplace in a github repo, without specifying it', () => __awaiter(this, void 0, void 0, function* () {
        const xmlManifest = yield toXMLManifest({
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            engines: Object.create(null),
            repository: 'https://github.com/username/repository',
        });
        assertMissingProperty(xmlManifest, 'Microsoft.VisualStudio.Services.EnableMarketplaceQnA');
        assertMissingProperty(xmlManifest, 'Microsoft.VisualStudio.Services.CustomerQnALink');
    }));
    it('should use marketplace in a github repo, when specifying it', () => __awaiter(this, void 0, void 0, function* () {
        const xmlManifest = yield toXMLManifest({
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            engines: Object.create(null),
            repository: 'https://github.com/username/repository',
            qna: 'marketplace',
        });
        assertProperty(xmlManifest, 'Microsoft.VisualStudio.Services.EnableMarketplaceQnA', 'true');
        assertMissingProperty(xmlManifest, 'Microsoft.VisualStudio.Services.CustomerQnALink');
    }));
    it('should handle qna=marketplace', () => __awaiter(this, void 0, void 0, function* () {
        const xmlManifest = yield toXMLManifest({
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            engines: Object.create(null),
            qna: 'marketplace',
        });
        assertProperty(xmlManifest, 'Microsoft.VisualStudio.Services.EnableMarketplaceQnA', 'true');
        assertMissingProperty(xmlManifest, 'Microsoft.VisualStudio.Services.CustomerQnALink');
    }));
    it('should handle qna=false', () => __awaiter(this, void 0, void 0, function* () {
        const xmlManifest = yield toXMLManifest({
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            engines: Object.create(null),
            qna: false,
        });
        assertProperty(xmlManifest, 'Microsoft.VisualStudio.Services.EnableMarketplaceQnA', 'false');
        assertMissingProperty(xmlManifest, 'Microsoft.VisualStudio.Services.CustomerQnALink');
    }));
    it('should handle custom qna', () => __awaiter(this, void 0, void 0, function* () {
        const xmlManifest = yield toXMLManifest({
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            engines: Object.create(null),
            qna: 'http://myqna',
        });
        assertMissingProperty(xmlManifest, 'Microsoft.VisualStudio.Services.EnableMarketplaceQnA');
        assertProperty(xmlManifest, 'Microsoft.VisualStudio.Services.CustomerQnALink', 'http://myqna');
    }));
});
describe('toContentTypes', () => {
    it('should produce a good xml', () => {
        return package_1.toContentTypes([])
            .then(xml => parseContentTypes(xml))
            .then(result => {
            assert.ok(result);
            assert.ok(result.Types);
            assert.ok(result.Types.Default);
            assert.equal(result.Types.Default.length, 2);
            assert.ok(result.Types.Default.some(d => d.$.Extension === '.vsixmanifest' && d.$.ContentType === 'text/xml'));
            assert.ok(result.Types.Default.some(d => d.$.Extension === '.json' && d.$.ContentType === 'application/json'));
        });
    });
    it('should include extra extensions', () => {
        const files = [
            { path: 'hello.txt', contents: '' },
            { path: 'hello.png', contents: '' },
            { path: 'hello.md', contents: '' },
            { path: 'hello', contents: '' },
        ];
        return package_1.toContentTypes(files)
            .then(xml => parseContentTypes(xml))
            .then(result => {
            assert.ok(result.Types.Default, 'there are content types');
            assert.ok(result.Types.Default.some(d => d.$.Extension === '.txt' && d.$.ContentType === 'text/plain'), 'there are txt');
            assert.ok(result.Types.Default.some(d => d.$.Extension === '.png' && d.$.ContentType === 'image/png'), 'there are png');
            assert.ok(result.Types.Default.some(d => d.$.Extension === '.md' && /^text\/(x-)?markdown$/.test(d.$.ContentType)), 'there are md');
            assert.ok(!result.Types.Default.some(d => d.$.Extension === ''));
        });
    });
});
describe('MarkdownProcessor', () => {
    it('should throw when no baseContentUrl is provided', () => __awaiter(this, void 0, void 0, function* () {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            description: 'test extension',
            engines: Object.create(null),
        };
        const root = fixture('readme');
        const processor = new package_1.ReadmeProcessor(manifest, {});
        const readme = {
            path: 'extension/readme.md',
            localPath: path.join(root, 'readme.md'),
        };
        let didThrow = false;
        try {
            yield processor.onFile(readme);
        }
        catch (err) {
            didThrow = true;
        }
        assert.ok(didThrow);
    }));
    it('should take baseContentUrl', () => {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            description: 'test extension',
            engines: Object.create(null),
        };
        const root = fixture('readme');
        const processor = new package_1.ReadmeProcessor(manifest, {
            baseContentUrl: 'https://github.com/username/repository/blob/master',
            baseImagesUrl: 'https://github.com/username/repository/raw/master',
        });
        const readme = {
            path: 'extension/readme.md',
            localPath: path.join(root, 'readme.md'),
        };
        return processor
            .onFile(readme)
            .then(file => package_1.read(file))
            .then(actual => {
            return readFile(path.join(root, 'readme.expected.md'), 'utf8').then(expected => {
                assert.equal(actual, expected);
            });
        });
    });
    it('should infer baseContentUrl if its a github repo', () => {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            description: 'test extension',
            engines: Object.create(null),
            repository: 'https://github.com/username/repository',
        };
        const root = fixture('readme');
        const processor = new package_1.ReadmeProcessor(manifest, {});
        const readme = {
            path: 'extension/readme.md',
            localPath: path.join(root, 'readme.md'),
        };
        return processor
            .onFile(readme)
            .then(file => package_1.read(file))
            .then(actual => {
            return readFile(path.join(root, 'readme.expected.md'), 'utf8').then(expected => {
                assert.equal(actual, expected);
            });
        });
    });
    it('should replace relative links with GitHub URLs while respecting githubBranch', () => {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            description: 'test extension',
            engines: Object.create(null),
            repository: 'https://github.com/username/repository',
        };
        const root = fixture('readme');
        const processor = new package_1.ReadmeProcessor(manifest, {
            githubBranch: 'main',
        });
        const readme = {
            path: 'extension/readme.md',
            localPath: path.join(root, 'readme.md'),
        };
        return processor
            .onFile(readme)
            .then(file => package_1.read(file))
            .then(actual => {
            return readFile(path.join(root, 'readme.branch.main.expected.md'), 'utf8').then(expected => {
                assert.equal(actual, expected);
            });
        });
    });
    it('should override image URLs with baseImagesUrl while also respecting githubBranch', () => {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            description: 'test extension',
            engines: Object.create(null),
            repository: 'https://github.com/username/repository',
        };
        const root = fixture('readme');
        const processor = new package_1.ReadmeProcessor(manifest, {
            githubBranch: 'main',
            // Override image relative links to point to different base URL
            baseImagesUrl: 'https://github.com/base',
        });
        const readme = {
            path: 'extension/readme.md',
            localPath: path.join(root, 'readme.md'),
        };
        return processor
            .onFile(readme)
            .then(file => package_1.read(file))
            .then(actual => {
            return readFile(path.join(root, 'readme.branch.override.images.expected.md'), 'utf8').then(expected => {
                assert.equal(actual, expected);
            });
        });
    });
    it('should override githubBranch setting with baseContentUrl', () => {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            description: 'test extension',
            engines: Object.create(null),
            repository: 'https://github.com/username/repository',
        };
        const root = fixture('readme');
        const processor = new package_1.ReadmeProcessor(manifest, {
            githubBranch: 'main',
            baseContentUrl: 'https://github.com/base',
        });
        const readme = {
            path: 'extension/readme.md',
            localPath: path.join(root, 'readme.md'),
        };
        return processor
            .onFile(readme)
            .then(file => package_1.read(file))
            .then(actual => {
            return readFile(path.join(root, 'readme.branch.override.content.expected.md'), 'utf8').then(expected => {
                assert.equal(actual, expected);
            });
        });
    });
    it('should infer baseContentUrl if its a github repo (.git)', () => {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            description: 'test extension',
            engines: Object.create(null),
            repository: 'https://github.com/username/repository.git',
        };
        const root = fixture('readme');
        const processor = new package_1.ReadmeProcessor(manifest, {});
        const readme = {
            path: 'extension/readme.md',
            localPath: path.join(root, 'readme.md'),
        };
        return processor
            .onFile(readme)
            .then(file => package_1.read(file))
            .then(actual => {
            return readFile(path.join(root, 'readme.expected.md'), 'utf8').then(expected => {
                assert.equal(actual, expected);
            });
        });
    });
    it('should replace img urls with baseImagesUrl', () => {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            description: 'test extension',
            engines: Object.create(null),
            repository: 'https://github.com/username/repository.git',
        };
        const options = {
            baseImagesUrl: 'https://github.com/username/repository/path/to',
        };
        const root = fixture('readme');
        const processor = new package_1.ReadmeProcessor(manifest, options);
        const readme = {
            path: 'extension/readme.md',
            localPath: path.join(root, 'readme.md'),
        };
        return processor
            .onFile(readme)
            .then(file => package_1.read(file))
            .then(actual => {
            return readFile(path.join(root, 'readme.images.expected.md'), 'utf8').then(expected => {
                assert.equal(actual, expected);
            });
        });
    });
    it('should replace issue links with urls if its a github repo.', () => {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            description: 'test extension',
            engines: Object.create(null),
            repository: 'https://github.com/username/repository.git',
        };
        const root = fixture('readme');
        const processor = new package_1.ReadmeProcessor(manifest, {});
        const readme = {
            path: 'extension/readme.md',
            localPath: path.join(root, 'readme.github.md'),
        };
        return processor
            .onFile(readme)
            .then(file => package_1.read(file))
            .then(actual => {
            return readFile(path.join(root, 'readme.github.expected.md'), 'utf8').then(expected => {
                assert.equal(actual, expected);
            });
        });
    });
    it('should not replace issue links with urls if its a github repo but issue link expansion is disabled.', () => {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            description: 'test extension',
            engines: Object.create(null),
            repository: 'https://github.com/username/repository.git',
        };
        const root = fixture('readme');
        const processor = new package_1.ReadmeProcessor(manifest, { expandGitHubIssueLinks: false });
        const readme = {
            path: 'extension/readme.md',
            localPath: path.join(root, 'readme.github.md'),
        };
        return processor
            .onFile(readme)
            .then(file => package_1.read(file))
            .then(actual => {
            return readFile(path.join(root, 'readme.github.md'), 'utf8').then(expected => {
                assert.equal(actual, expected);
            });
        });
    });
    it('should not replace issue links with urls if its not a github repo.', () => {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            description: 'test extension',
            engines: Object.create(null),
            repository: 'https://some-other-provider.com/username/repository.git',
        };
        const root = fixture('readme');
        const processor = new package_1.ReadmeProcessor(manifest, {});
        const readme = {
            path: 'extension/readme.md',
            localPath: path.join(root, 'readme.github.md'),
        };
        return processor
            .onFile(readme)
            .then(file => package_1.read(file))
            .then(actual => {
            return readFile(path.join(root, 'readme.github.md'), 'utf8').then(expected => {
                assert.equal(actual, expected);
            });
        });
    });
    it('should prevent non-HTTPS images', () => __awaiter(this, void 0, void 0, function* () {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            engines: Object.create(null),
            repository: 'https://github.com/username/repository',
        };
        const contents = `![title](http://foo.png)`;
        const processor = new package_1.ReadmeProcessor(manifest, {});
        const readme = { path: 'extension/readme.md', contents };
        yield throws(() => processor.onFile(readme));
    }));
    it('should prevent non-HTTPS img tags', () => __awaiter(this, void 0, void 0, function* () {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            engines: Object.create(null),
            repository: 'https://github.com/username/repository',
        };
        const contents = `<img src="http://foo.png" />`;
        const processor = new package_1.ReadmeProcessor(manifest, {});
        const readme = { path: 'extension/readme.md', contents };
        yield throws(() => processor.onFile(readme));
    }));
    it('should prevent SVGs from not trusted sources', () => __awaiter(this, void 0, void 0, function* () {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            engines: Object.create(null),
            repository: 'https://github.com/username/repository',
        };
        const contents = `![title](https://foo/hello.svg)`;
        const processor = new package_1.ReadmeProcessor(manifest, {});
        const readme = { path: 'extension/readme.md', contents };
        yield throws(() => processor.onFile(readme));
    }));
    it('should allow SVGs from trusted sources', () => __awaiter(this, void 0, void 0, function* () {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            engines: Object.create(null),
            repository: 'https://github.com/username/repository',
        };
        const contents = `![title](https://badges.gitter.im/hello.svg)`;
        const processor = new package_1.ReadmeProcessor(manifest, {});
        const readme = { path: 'extension/readme.md', contents };
        const file = yield processor.onFile(readme);
        assert(file);
    }));
    it('should allow SVG from GitHub actions in image tag', () => __awaiter(this, void 0, void 0, function* () {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            engines: Object.create(null),
            repository: 'https://github.com/username/repository',
        };
        const contents = `![title](https://github.com/fakeuser/fakerepo/workflows/fakeworkflowname/badge.svg)`;
        const processor = new package_1.ReadmeProcessor(manifest, {});
        const readme = { path: 'extension/readme.md', contents };
        const file = yield processor.onFile(readme);
        assert(file);
    }));
    it('should prevent SVG from a GitHub repo in image tag', () => __awaiter(this, void 0, void 0, function* () {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            engines: Object.create(null),
            repository: 'https://github.com/username/repository',
        };
        const contents = `![title](https://github.com/eviluser/evilrepo/blob/master/malicious.svg)`;
        const processor = new package_1.ReadmeProcessor(manifest, {});
        const readme = { path: 'extension/readme.md', contents };
        yield throws(() => processor.onFile(readme));
    }));
    it('should prevent SVGs from not trusted sources in img tags', () => __awaiter(this, void 0, void 0, function* () {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            engines: Object.create(null),
            repository: 'https://github.com/username/repository',
        };
        const contents = `<img src="https://foo/hello.svg" />`;
        const processor = new package_1.ReadmeProcessor(manifest, {});
        const readme = { path: 'extension/readme.md', contents };
        yield throws(() => processor.onFile(readme));
    }));
    it('should allow SVGs from trusted sources in img tags', () => __awaiter(this, void 0, void 0, function* () {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            engines: Object.create(null),
            repository: 'https://github.com/username/repository',
        };
        const contents = `<img src="https://badges.gitter.im/hello.svg" />`;
        const processor = new package_1.ReadmeProcessor(manifest, {});
        const readme = { path: 'extension/readme.md', contents };
        const file = yield processor.onFile(readme);
        assert(file);
    }));
    it('should prevent SVG tags', () => __awaiter(this, void 0, void 0, function* () {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            engines: Object.create(null),
            repository: 'https://github.com/username/repository',
        };
        const contents = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><path d="M224 387.814V512L32 320l192-192v126.912C447.375 260.152 437.794 103.016 380.93 0 521.287 151.707 491.48 394.785 224 387.814z"/></svg>`;
        const processor = new package_1.ReadmeProcessor(manifest, {});
        const readme = { path: 'extension/readme.md', contents };
        yield throws(() => processor.onFile(readme));
    }));
    it('should prevent SVG data urls in img tags', () => __awaiter(this, void 0, void 0, function* () {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            engines: Object.create(null),
            repository: 'https://github.com/username/repository',
        };
        const contents = `<img src="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA1MTIgNTEyIj48cGF0aCBkPSJNMjI0IDM4Ny44MTRWNTEyTDMyIDMyMGwxOTItMTkydjEyNi45MTJDNDQ3LjM3NSAyNjAuMTUyIDQzNy43OTQgMTAzLjAxNiAzODAuOTMgMCA1MjEuMjg3IDE1MS43MDcgNDkxLjQ4IDM5NC43ODUgMjI0IDM4Ny44MTR6Ii8+PC9zdmc+" />`;
        const processor = new package_1.ReadmeProcessor(manifest, {});
        const readme = { path: 'extension/readme.md', contents };
        yield throws(() => processor.onFile(readme));
    }));
    it('should catch an unchanged README.md', () => __awaiter(this, void 0, void 0, function* () {
        const manifest = {
            name: 'test',
            publisher: 'mocha',
            version: '0.0.1',
            engines: Object.create(null),
            repository: 'https://github.com/username/repository',
        };
        const contents = `This is the README for your extension `;
        const processor = new package_1.ReadmeProcessor(manifest, {});
        const readme = { path: 'extension/readme.md', contents };
        yield throws(() => processor.onFile(readme));
    }));
});
describe('isSupportedWebExtension', () => {
    it('should return true if extension report has extension', () => {
        const manifest = createManifest({ name: 'test', publisher: 'mocha' });
        const extensionReport = { malicious: [], web: { extensions: ['mocha.test'], publishers: [] } };
        assert.ok(package_1.isSupportedWebExtension(manifest, extensionReport));
    });
    it('should return true if extension report has publisher', () => {
        const manifest = createManifest({ name: 'test', publisher: 'mocha' });
        const extensionReport = { malicious: [], web: { extensions: [], publishers: ['mocha'] } };
        assert.ok(package_1.isSupportedWebExtension(manifest, extensionReport));
    });
    it('should return  false if extension report does not has extension', () => {
        const manifest = createManifest({ name: 'test', publisher: 'mocha' });
        const extensionReport = { malicious: [], web: { extensions: [], publishers: [] } };
        assert.ok(!package_1.isSupportedWebExtension(manifest, extensionReport));
    });
});
describe('WebExtensionProcessor', () => {
    it('should include file', () => __awaiter(this, void 0, void 0, function* () {
        const manifest = createManifest({ extensionKind: ['web'] });
        const processor = new package_1.WebExtensionProcessor(manifest, { web: true });
        const file = { path: 'extension/browser.js', contents: '' };
        yield processor.onFile(file);
        yield processor.onEnd();
        const expected = [{ type: `Microsoft.VisualStudio.Code.WebResources/${file.path}`, path: file.path }];
        assert.deepEqual(processor.assets, expected);
    }));
    it('should include file when extension kind is not specified', () => __awaiter(this, void 0, void 0, function* () {
        const manifest = createManifest({ browser: 'browser.js' });
        const processor = new package_1.WebExtensionProcessor(manifest, { web: true });
        const file = { path: 'extension/browser.js', contents: '' };
        yield processor.onFile(file);
        yield processor.onEnd();
        const expected = [{ type: `Microsoft.VisualStudio.Code.WebResources/${file.path}`, path: file.path }];
        assert.deepEqual(processor.assets, expected);
    }));
    it('should not include file when not asked for', () => __awaiter(this, void 0, void 0, function* () {
        const manifest = createManifest({ extensionKind: ['web'] });
        const processor = new package_1.WebExtensionProcessor(manifest, { web: false });
        const file = { path: 'extension/browser.js', contents: '' };
        yield processor.onFile(file);
        yield processor.onEnd();
        assert.deepEqual(processor.assets, []);
    }));
    it('should not include file for non web extension', () => __awaiter(this, void 0, void 0, function* () {
        const manifest = createManifest({ extensionKind: ['ui'] });
        const processor = new package_1.WebExtensionProcessor(manifest, { web: true });
        const file = { path: 'extension/browser.js', contents: '' };
        yield processor.onFile(file);
        yield processor.onEnd();
        assert.deepEqual(processor.assets, []);
    }));
    it('should include manifest', () => __awaiter(this, void 0, void 0, function* () {
        const manifest = createManifest({ extensionKind: ['web'] });
        const processor = new package_1.WebExtensionProcessor(manifest, { web: true });
        const manifestFile = { path: 'extension/package.json', contents: JSON.stringify(manifest) };
        yield processor.onFile(manifestFile);
        yield processor.onEnd();
        const expected = [
            { type: `Microsoft.VisualStudio.Code.WebResources/${manifestFile.path}`, path: manifestFile.path },
        ];
        assert.deepEqual(processor.assets, expected);
    }));
    it('should fail for svg file', () => __awaiter(this, void 0, void 0, function* () {
        const manifest = createManifest({ extensionKind: ['web'] });
        const processor = new package_1.WebExtensionProcessor(manifest, { web: true });
        try {
            yield processor.onFile({ path: 'extension/sample.svg', contents: '' });
        }
        catch (error) {
            return; // expected
        }
        assert.fail('Should fail');
    }));
    it('should include max 25 files', () => __awaiter(this, void 0, void 0, function* () {
        const manifest = createManifest({ extensionKind: ['web'] });
        const processor = new package_1.WebExtensionProcessor(manifest, { web: true });
        const expected = [];
        for (let i = 1; i <= 25; i++) {
            const file = { path: `extension/${i}.json`, contents: `${i}` };
            yield processor.onFile(file);
            expected.push({ type: `Microsoft.VisualStudio.Code.WebResources/${file.path}`, path: file.path });
        }
        yield processor.onEnd();
        assert.deepEqual(processor.assets.length, 25);
        assert.deepEqual(processor.assets, expected);
    }));
    it('should throw an error if there are more than 25 files', () => __awaiter(this, void 0, void 0, function* () {
        const manifest = createManifest({ extensionKind: ['web'] });
        const processor = new package_1.WebExtensionProcessor(manifest, { web: true });
        for (let i = 1; i <= 26; i++) {
            yield processor.onFile({ path: `extension/${i}.json`, contents: `${i}` });
        }
        try {
            yield processor.onEnd();
        }
        catch (error) {
            return; // expected error
        }
        assert.fail('Should fail');
    }));
    it('should include web extension property & tag', () => __awaiter(this, void 0, void 0, function* () {
        const manifest = createManifest({ extensionKind: ['web'] });
        const processor = new package_1.WebExtensionProcessor(manifest, { web: true });
        yield processor.onEnd();
        assert.equal(processor.vsix.webExtension, true);
        assert.deepEqual(processor.tags, ['__web_extension']);
    }));
    it('should include web extension property & tag when extension kind is not provided', () => __awaiter(this, void 0, void 0, function* () {
        const manifest = createManifest({ browser: 'browser.js' });
        const processor = new package_1.WebExtensionProcessor(manifest, { web: true });
        yield processor.onEnd();
        assert.equal(processor.vsix.webExtension, true);
        assert.deepEqual(processor.tags, ['__web_extension']);
    }));
    it('should not include web extension property & tag when not asked for', () => __awaiter(this, void 0, void 0, function* () {
        const manifest = createManifest({ extensionKind: ['web'] });
        const processor = new package_1.WebExtensionProcessor(manifest, { web: false });
        yield processor.onEnd();
        assert.equal(processor.vsix.webExtension, undefined);
        assert.deepEqual(processor.tags, []);
    }));
    it('should not include web extension property & tag for non web extension', () => __awaiter(this, void 0, void 0, function* () {
        const manifest = createManifest({ extensionKind: ['ui'] });
        const processor = new package_1.WebExtensionProcessor(manifest, { web: true });
        yield processor.onEnd();
        assert.equal(processor.vsix.webExtension, undefined);
        assert.deepEqual(processor.tags, []);
    }));
});