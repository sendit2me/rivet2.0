import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultOutDir = path.join(repoRoot, '.rivet-built-packages');

const outDirArgIndex = process.argv.indexOf('--out-dir');
const outDir =
  outDirArgIndex >= 0 && process.argv[outDirArgIndex + 1]
    ? path.resolve(process.argv[outDirArgIndex + 1])
    : defaultOutDir;

const packages = [
  {
    name: '@rivet2/rivet-core',
    sourceDir: path.join(repoRoot, 'packages/core'),
    artifactDir: 'rivet2-rivet-core',
  },
  {
    name: '@rivet2/rivet-node',
    sourceDir: path.join(repoRoot, 'packages/node'),
    artifactDir: 'rivet2-rivet-node',
    rewriteDependencies: {
      '@rivet2/rivet-core': 'file:../rivet2-rivet-core',
    },
  },
];

function isSameOrInside(parentPath, childPath) {
  const relative = path.relative(parentPath, childPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function assertSafeOutDir(targetDir) {
  const resolvedTargetDir = path.resolve(targetDir);
  const root = path.parse(resolvedTargetDir).root;

  if (resolvedTargetDir === root) {
    throw new Error(`Refusing to recreate filesystem root as an output directory: ${resolvedTargetDir}`);
  }

  if (isSameOrInside(resolvedTargetDir, repoRoot)) {
    throw new Error(
      `Refusing to recreate the repository root or one of its parents as an output directory: ${resolvedTargetDir}`,
    );
  }

  if (isSameOrInside(repoRoot, resolvedTargetDir) && !isSameOrInside(defaultOutDir, resolvedTargetDir)) {
    throw new Error(
      `Output directories inside this repository must live under ${path.relative(repoRoot, defaultOutDir)}: ${resolvedTargetDir}`,
    );
  }

  for (const pkg of packages) {
    if (isSameOrInside(pkg.sourceDir, resolvedTargetDir) || isSameOrInside(resolvedTargetDir, pkg.sourceDir)) {
      throw new Error(
        `Output directory must not overlap ${pkg.name}'s source directory (${path.relative(repoRoot, pkg.sourceDir)}): ${resolvedTargetDir}`,
      );
    }
  }
}

async function pathExists(filePath) {
  try {
    await readFile(filePath);
    return true;
  } catch {
    return false;
  }
}

async function assertBuiltPackage(pkg) {
  const requiredFiles = ['dist/esm/index.js', 'dist/cjs/bundle.cjs', 'dist/types/index.d.ts'];
  const missingFiles = [];

  for (const file of requiredFiles) {
    if (!(await pathExists(path.join(pkg.sourceDir, file)))) {
      missingFiles.push(file);
    }
  }

  if (missingFiles.length > 0) {
    throw new Error(
      `${pkg.name} has not been built. Missing ${missingFiles.join(', ')}. Run its workspace build first.`,
    );
  }
}

function sanitizePackageJson(pkg, packageJson) {
  const nextPackageJson = {
    name: packageJson.name,
    version: packageJson.version,
    license: packageJson.license,
    repository: packageJson.repository,
    type: packageJson.type,
    main: packageJson.main,
    module: packageJson.module,
    types: packageJson.types,
    exports: packageJson.exports,
    dependencies: {
      ...(packageJson.dependencies ?? {}),
      ...(pkg.rewriteDependencies ?? {}),
    },
  };

  return `${JSON.stringify(nextPackageJson, null, 2)}\n`;
}

async function copyIfPresent(from, to) {
  if (await pathExists(from)) {
    await cp(from, to, { recursive: true });
  }
}

assertSafeOutDir(outDir);

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

for (const pkg of packages) {
  await assertBuiltPackage(pkg);

  const targetDir = path.join(outDir, pkg.artifactDir);
  await mkdir(targetDir, { recursive: true });

  const packageJson = JSON.parse(await readFile(path.join(pkg.sourceDir, 'package.json'), 'utf8'));
  await writeFile(path.join(targetDir, 'package.json'), sanitizePackageJson(pkg, packageJson));
  await cp(path.join(pkg.sourceDir, 'dist'), path.join(targetDir, 'dist'), { recursive: true });
  await copyIfPresent(path.join(pkg.sourceDir, 'README.md'), path.join(targetDir, 'README.md'));
  await copyIfPresent(path.join(pkg.sourceDir, 'LICENSE'), path.join(targetDir, 'LICENSE'));

  console.log(`Prepared ${pkg.name} at ${path.relative(repoRoot, targetDir)}`);
}

console.log(`Built package artifacts are ready at ${path.relative(repoRoot, outDir)}`);
