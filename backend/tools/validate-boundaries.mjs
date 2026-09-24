import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoots = ['apps', 'libs'];

async function filesUnder(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.nx') continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(path));
    else files.push(path);
  }
  return files;
}

function projectBoundary(project) {
  return project.tags.filter((tag) => tag.startsWith('boundary:'));
}

function parsePolicy(markdown) {
  const policies = new Map();
  for (const line of markdown.split(/\r?\n/)) {
    if (!line.trimStart().startsWith('| `boundary:')) continue;
    const cells = line.split('|').map((cell) => cell.trim());
    const source = cells[1]?.match(/^`(boundary:[^`]+)`$/)?.[1];
    if (!source || !cells[2]) continue;
    const allowed = new Set(cells[2].match(/boundary:[a-z0-9-]+/g) ?? []);
    const previous = policies.get(source);
    if (previous && [...previous].sort().join('|') !== [...allowed].sort().join('|')) {
      throw new Error(`conflicting policy rows for ${source}`);
    }
    policies.set(source, allowed);
  }
  return policies;
}

function sourceImportSpecifiers(source) {
  const specs = new Set();
  const patterns = [
    /\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\bimport\s*["']([^"']+)["']/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) specs.add(match[1]);
  }
  return specs;
}

async function resolveImportedFile(importer, specifier) {
  const base = resolve(dirname(importer), specifier.replace(/\.js$/, '.ts'));
  const candidates = [base, `${base}.ts`, `${base}.mts`, resolve(base, 'index.ts')];
  for (const candidate of candidates) {
    try {
      if ((await stat(candidate)).isFile()) return candidate;
    } catch {
      // The import may point outside a tracked project; the caller reports it only
      // when it resolves into apps/libs without a registered project.
    }
  }
  return null;
}

function ownsPath(projects, path) {
  const normalized = resolve(path) + sep;
  return projects
    .filter((project) => normalized.startsWith(resolve(root, project.sourceRoot) + sep))
    .sort((left, right) => right.sourceRoot.length - left.sourceRoot.length)[0];
}

async function loadProjects() {
  const projectFiles = (await Promise.all(sourceRoots.map((directory) => filesUnder(resolve(root, directory)))))
    .flat()
    .filter((path) => path.endsWith(`${sep}project.json`));
  const projects = [];
  for (const path of projectFiles) {
    const config = JSON.parse(await readFile(path, 'utf8'));
    if (!config.name || !config.sourceRoot || !Array.isArray(config.tags)) {
      throw new Error(`invalid project metadata: ${relative(root, path)}`);
    }
    projects.push({ name: config.name, sourceRoot: config.sourceRoot, tags: config.tags, configPath: path });
  }
  return projects;
}

export async function validateBoundaries() {
  const [projects, policyText] = await Promise.all([
    loadProjects(),
    readFile(resolve(root, 'docs/architecture/NX-PROJECT-GRAPH.md'), 'utf8'),
  ]);
  const policies = parsePolicy(policyText);
  const violations = [];
  const projectByName = new Map(projects.map((project) => [project.name, project]));

  for (const project of projects) {
    const tags = projectBoundary(project);
    if (tags.length !== 1) {
      violations.push(`${project.name}: expected exactly one boundary tag, found ${tags.join(', ') || 'none'}`);
      continue;
    }
    if (!policies.has(tags[0])) violations.push(`${project.name}: no policy row for ${tags[0]}`);
    if (!projectByName.has(project.name)) violations.push(`${project.name}: project name is not registered`);
  }

  const allSourceFiles = (await Promise.all(sourceRoots.map((directory) => filesUnder(resolve(root, directory)))))
    .flat()
    .filter((path) => ['.ts', '.mts', '.cts'].includes(extname(path)) && !path.endsWith('.d.ts'));
  const sourceFiles = [];
  for (const sourceFile of allSourceFiles) {
    if (ownsPath(projects, sourceFile)) sourceFiles.push(sourceFile);
    else violations.push(`${relative(root, sourceFile)}: unregistered internal source`);
  }
  for (const importer of sourceFiles) {
    const sourceProject = ownsPath(projects, importer);
    if (!sourceProject) continue;
    const sourceTag = projectBoundary(sourceProject)[0];
    const allowed = policies.get(sourceTag) ?? new Set();
    const source = await readFile(importer, 'utf8');
    for (const specifier of sourceImportSpecifiers(source)) {
      if (!specifier.startsWith('.')) continue;
      const targetPath = await resolveImportedFile(importer, specifier);
      if (!targetPath) continue;
      const targetProject = ownsPath(projects, targetPath);
      const targetRelative = relative(root, targetPath);
      if (!targetProject && /^(apps|libs)${sep}/.test(targetRelative)) {
        violations.push(`${relative(root, importer)} -> ${targetRelative}: unregistered internal source`);
      } else if (targetProject && targetProject.name !== sourceProject.name) {
        const targetTag = projectBoundary(targetProject)[0];
        if (!allowed.has(targetTag)) {
          violations.push(`${relative(root, importer)} -> ${targetProject.name}: ${sourceTag} cannot depend on ${targetTag}`);
        }
      }
    }
  }

  return { projects, violations };
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (isAbsolute(fileURLToPath(import.meta.url)) && invokedPath === fileURLToPath(import.meta.url)) {
  const result = await validateBoundaries();
  if (result.violations.length > 0) {
    console.error(`Boundary validation failed with ${result.violations.length} finding(s):`);
    for (const violation of result.violations) console.error(`- ${violation}`);
    process.exitCode = 1;
  } else {
    console.log(`Boundary validation passed for ${result.projects.length} Nx projects.`);
  }
}
