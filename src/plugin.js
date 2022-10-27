/**
 * Copyright 2019 Goodwill of Central and Northern Arizona

 * Licensed under the BSD 3-Clause (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at

 * https://opensource.org/licenses/BSD-3-Clause

 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { dump as yamlDump, loadAll as yamlParse } from 'js-yaml';
import structuredClone from '@ungap/structured-clone';
import logger from './lib/logger.js';

const cacheMap = {
  composer: '/root/.composer/cache',
  npm: '/root/.npm',
  yarn: '.yarn/cache',
  dotnetcore: '/root/.nuget/packages',
  gradle: '/root/.gradle/caches',
  ivy2: '/root/.ivy2/cache',
  maven: '/root/.m2/repository',
  pip: '/root/.cache/pip',
  sbt: '/root/.sbt',
}

export class Plugin {
  #image;
  #cachePath;
  #cacheEnv;

  constructor ({ image, cachePath }, env = {}) {
    this.#image = image;
    this.#cachePath = cachePath;
    this.#cacheEnv = this.#getCacheEnv(env);
  }

  #getCacheEnv (env) {
    // Get all the environment variables ...
    const environment = Object.entries(env)
      // ... passed in for Cache ...
      .filter(([key]) => key.match(/^CACHE_/))
      // ... and combine into a new object, with CACHE_ replaced with PLUGIN_
      .reduce(
        (res, [key, value]) => Object.assign(res, { [key.replace(/^CACHE_/, 'PLUGIN_')]: value }),
        {} // Initial value, needs to be an empty object
      );

    logger.debug('Cache environment variables', { environment });

    return environment;
  }

  run (config) {
    logger.debug('Configuration', { config });

    // Parse the yaml (could be multiple documents in one file)
    const documents = [];
    yamlParse(config, this.#docProcessor(documents));

    // Return the modified yaml
    const modifiedConfig = '---\n' +
      documents
        .map(doc => yamlDump(doc, { noRefs: true, lineWidth: 500 }))
        .join('\n---\n');
    logger.debug('Modified configuration', { modifiedConfig });

    return modifiedConfig;
  }

  #docProcessor (documents) {
    return (originalDoc) => {
      const doc = structuredClone(originalDoc);

      if (doc.kind !== 'pipeline' || !doc.hasOwnProperty('steps')) {
        return documents.push(doc);
      }

      // Set a higher level variable, that if true, will add appropriate volumes to the pipeline
      let cachesUsed = new Set();

      // Iterate every step in the document, check if we want to use caches on it, and fix it up, so it works right
      doc.steps = doc.steps.flatMap(step => {
        // Start simple, if the step has no cache setup, just return the step
        if (!Object.hasOwn(step, 'caches') || !Array.isArray(step.caches)) {
          return step;
        }

        // Put our caches into a set to 'uniquify' them and make sure we actually support them
        const stepCaches = new Set(step.caches.filter(cacheMap.hasOwnProperty, cacheMap));
        if (stepCaches.size === 0) {
          return step;
        }

        // Add all the step caches to the total caches used
        stepCaches.forEach(cachesUsed.add, cachesUsed);

        // Add our core step and then wrap it with restore and rebuild steps
        const restoreStep = this.#createCacheStep(step.name, step?.when, 'restore', stepCaches),
              rebuildStep = this.#createCacheStep(step.name, step?.when, 'rebuild', stepCaches);

        return [
          this.#addStepVolumes(restoreStep, stepCaches),
          this.#addStepVolumes(step, stepCaches),
          this.#addStepVolumes(rebuildStep, stepCaches)
        ];
      });

      // Add a volume
      if (cachesUsed.size > 0) {
        doc.volumes = doc.volumes ?? [];
        // Add a cache volume
        doc.volumes.push({ name: 'cache', host: { path: this.#cachePath }})
        // Add temp volumes for all the caches
        doc.volumes.push(...this.#createCacheVolumes(cachesUsed));
      }

      documents.push(doc);
    };
  }

  /**
   *
   * @param {string} stepName
   * @param {Object} when
   * @param {string} action
   * @param {Set} caches
   * @returns {{image, settings: {mount: *}, environment: {[p: number]: string}, name: string, volumes: [{path: string, name: string}]}}
   */
  #createCacheStep (stepName, when, action, caches) {
    const environment = Object.assign({}, this.#cacheEnv);

    const step = {
      name: `${stepName}-cache-${action}`,
      image: this.#image,
      environment,
      settings: {
        mount: Object.entries(cacheMap).filter(([cache]) => caches.has(cache)).map(([, path]) => path)
      },
      volumes: [{
        name: 'cache',
        path: environment.PLUGIN_FILESYSTEM_CACHE_ROOT ?? '/tmp/cache'
      }],
      when
    };

    step.settings[action] = true;

    return step;
  }

  /**
   * @param {Object} step
   * @param {Set} caches
   * @returns {{volumes}|*}
   */
  #addStepVolumes(step, caches) {
    step.volumes = step.volumes ?? [];

    // Add any volumes that are rooted
    step.volumes.push(...this.#createCacheMounts(caches));

    return step;
  }

  /**
   * Returns name, temp objects for mounting volumes for any caches used that are rooted
   * @param {Set} caches
   * @returns [{name: string, temp: {}}]
   */
  #createCacheVolumes(caches) {
    return Object.entries(cacheMap)
      .filter(([cache, path]) => caches.has(cache) && path.charAt(0) === '/')
      .map(([name]) => ({ name, temp: {} }));
  }

  /**
   * Returns name, path objects for mounting volumes for any caches used that are rooted
   * @param {Set} caches
   * @returns [{name: string, path: string}]
   */
  #createCacheMounts(caches) {
    return Object.entries(cacheMap)
      .filter(([cache, path]) => caches.has(cache) && path.charAt(0) === '/')
      .map(([name, path]) => ({ name, path }));
  }
}
