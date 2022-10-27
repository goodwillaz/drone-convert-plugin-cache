import 'chai/register-should.js';
import { Plugin } from '../src/plugin.js';
import { loadAll as yamlParse } from 'js-yaml';

describe('plugin.js tests', () => {
  /**
   * @var {Plugin}
   */
  let plugin;

  beforeEach(() => {
    plugin = new Plugin({ image: 'foo', cachePath: '/tmp/cache' }, {});
  });

  it('should not add anything to non-pipeline steps', () => {
    const result = plugin.run('kind: foo\nsteps:\n  - caches:\n    - npm');
    yamlParse(result)[0].steps.length.should.equal(1);
  });

  it ('should not add anything to a pipeline with no steps', () => {
    const result = plugin.run('kind: pipeline');
    yamlParse(result)[0].should.not.have.property('steps');
  });

  it ('should skip steps that have no caches key', () => {
    const result = plugin.run('kind: pipeline\nsteps:\n  - name: bar');
    yamlParse(result)[0].steps.length.should.equal(1);
  });

  it ('should skip steps where caches is not an array', () => {
    const result = plugin.run('kind: pipeline\nsteps:\n  - caches: npm');
    yamlParse(result)[0].steps.length.should.equal(1);
  });

  it ('should skip steps where specified caches are not supported', () => {
    const result = plugin.run('kind: pipeline\nsteps:\n  - caches:\n    - foo');
    yamlParse(result)[0].steps.length.should.equal(1);
  });

  it ('should not add cache volumes to the document when there are no caches used', () => {
    const result = plugin.run('kind: pipeline\nsteps:\n  - name: bar');
    yamlParse(result)[0].should.not.have.property('volumes');
  });

  it ('should add restore and rebuild steps around a step', () => {
    const result = plugin.run('kind: pipeline\nsteps:\n  - name: build\n    caches:\n    - npm');
    const config = yamlParse(result)[0];
    config.steps.length.should.equal(3);
    config.steps[0].should.deep.equal({
      name: 'build-cache-restore',
      image: 'foo',
      environment: {},
      settings: {
        mount: [ '/root/.npm' ],
        restore: true
      },
      volumes: [
        { name: 'cache', path: '/tmp/cache' },
        { name: 'npm', path: '/root/.npm' }
      ]
    });
    config.steps[1].should.deep.include({
      name: 'build',
      volumes: [
        { name: 'npm', path: '/root/.npm' }
      ]
    })
    config.steps[2].should.deep.include({
      name: 'build-cache-rebuild',
      image: 'foo',
      environment: {},
      settings: {
        mount: [ '/root/.npm' ],
        rebuild: true
      },
      volumes: [
        { name: 'cache', path: '/tmp/cache' },
        { name: 'npm', path: '/root/.npm' }
      ]
    });
    config.volumes.should.have.deep.members([
      { name: 'cache', host: { path: '/tmp/cache' } },
      { name: 'npm', temp: {} }
    ])
  });

  it ('should parse cache environment variables and add them to the cache steps', () => {
    const plugin = new Plugin({ image: 'foo', cachePath: '/tmp/cache' }, { CACHE_FOO: 'bar' });
    const result = plugin.run('kind: pipeline\nsteps:\n  - name: build\n    caches:\n    - npm');
    const config = yamlParse(result)[0];
    config.steps[0].environment.should.include({ PLUGIN_FOO: 'bar' })
    config.steps[2].environment.should.include({ PLUGIN_FOO: 'bar' })
  });

  it ('should use a volume path from PLUGIN_FILESYSTEM_CACHE_ROOT environment if set', () => {
    const plugin = new Plugin({ image: 'foo', cachePath: '/tmp/cache' }, { CACHE_FILESYSTEM_CACHE_ROOT: '/bar' });
    const result = plugin.run('kind: pipeline\nsteps:\n  - name: build\n    caches:\n    - npm');
    const config = yamlParse(result)[0];
    config.steps[0].volumes.should.deep.include.members([{ name: 'cache', path: '/bar' }]);
  });

  it('should not add cache volumes and mounts for non-rooted caches', () => {
    const result = plugin.run('kind: pipeline\nsteps:\n  - name: build\n    caches:\n    - yarn');
    const config = yamlParse(result)[0];
    config.steps[0].volumes.should.not.deep.include.members([{ name: 'yarn' }]);
  });

  it ('should support multiple documents', () => {
    const result = plugin.run('---\nkind: pipeline\nsteps:\n  - name: build\n    caches:\n    - npm\n---\nkind: pipeline\nsteps:\n  - name: build\n    caches:\n    - yarn');
    const config = yamlParse(result);
    config[0].steps.length.should.equal(3);
    config[1].steps.length.should.equal(3);
  });

  it ('should pass the "when" clause to the cache steps', () => {
    const result = plugin.run('kind: pipeline\nsteps:\n  - name: build\n    caches:\n    - yarn\n    when: foo');
    const config = yamlParse(result)[0];
    config.steps[0].when.should.equal('foo');
    config.steps[2].when.should.equal('foo');
  });
});
