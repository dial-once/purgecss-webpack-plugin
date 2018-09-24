import fs from 'fs'
import Purgecss from 'purgecss'
import { ConcatSource } from 'webpack-sources'
import * as parse from './parse'
import * as search from './search'

let webpackVersion = 4

const styleExtensions = ['.css', '.scss', '.styl', '.sass', '.less']
const pluginName = 'PurgeCSS'

export default class PurgecssPlugin {
    constructor(options) {
        this.options = options
    }

    apply(compiler) {
        if (typeof compiler.hooks === 'undefined') {
            webpackVersion = 3
        }

        if (webpackVersion === 4) {
            compiler.hooks.compilation.tap(pluginName, compilation => {
                this.initializePlugin(compilation)
            })
        } else {
            compiler.plugin('this-compilation', compilation => {
                this.initializePlugin(compilation)
            })
        }
    }

    initializePlugin(compilation) {
        const entryPaths = parse.entryPaths(this.options.paths)

        parse.flatten(entryPaths).forEach(p => {
            if (!fs.existsSync(p)) throw new Error(`Path ${p} does not exist.`)
        })

        if (webpackVersion === 4) {
            compilation.hooks.additionalAssets.tap(pluginName, () => {
                this.runPluginHook(compilation, entryPaths)
            })
        } else {
            compilation.plugin('additional-assets', callback => {
                this.runPluginHook(compilation, entryPaths, callback)
            })
        }
    }

    runPluginHook(compilation, entryPaths, callback = () => {}) {
        const assetsFromCompilation = search.assets(compilation.assets, ['.css'])
        // Go through chunks and purge as configured

        compilation.chunks.forEach(chunk => {
            const { name: chunkName, files } = chunk
            const assetsToPurge = assetsFromCompilation.filter(asset => {
                if (this.options.only) {
                    return [].concat(this.options.only).some(only => asset.name.indexOf(only) >= 0)
                } else {
                    return files.indexOf(asset.name) >= 0
                }
            })

            assetsToPurge.forEach(({ name, asset }) => {
                const filesToSearch = parse
                    .entries(entryPaths, chunkName)
                    .concat(
                        search.files(
                            chunk,
                            this.options.moduleExtensions || [],
                            file => file.resource,
                            webpackVersion
                        )
                    );

                // Compile through Purgecss and attach to output.
                // This loses sourcemaps should there be any!
                const options = {
                    ...this.options,
                    content: filesToSearch,
                    css: [
                        {
                            raw: asset.source()
                        }
                    ]
                }
                if (typeof options.whitelist === 'function') {
                    options.whitelist = options.whitelist()
                }
                if (typeof options.whitelistPatterns === 'function') {
                    options.whitelistPatterns = options.whitelistPatterns()
                }
                const purgecss = new Purgecss(options)
                compilation.assets[name] = new ConcatSource(purgecss.purge()[0].css)
            })
        })

        callback()
    }
}
