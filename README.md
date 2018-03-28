# gulp-cmd

> A gulp plugin for cmd transport and concat
>
> [![NPM Version][npm-image]][npm-url]
> [![Download Status][download-image]][npm-url]
> [![Dependencies][david-image]][david-url]

### Usage

```js
const path = require('path');
const join = path.join;
const relative = path.relative;
const gulp = require('gulp');
const cmd = require('@nuintun/gulp-cmd');
const alias = {
  'css-loader': 'util/css-loader/1.0.0/css-loader'
};

// Fixed css resource path
function onpath(path, property, file, wwwroot) {
  if (/^[^./\\]/.test(path)) {
    path = './' + path;
  }

  if (path.indexOf('.') === 0) {
    path = join(dirname(file), path);
    path = relative(wwwroot, path);
    path = '/' + path;
    path = path.replace(/\\+/g, '/');
  }

  path = path.replace('assets/', 'online/');

  return path;
}

// Task
gulp.task('default', function() {
  gulp
    .src('assets/js/**/*.js', { base: 'assets/js' })
    .pipe(
      cmd({
        alias: alias,
        ignore: ['jquery'],
        include: function(id) {
          return id.indexOf('view') === 0 ? 'all' : 'self';
        },
        css: { onpath: onpath }
      })
    )
    .pipe(gulp.dest('online/js'));
});
```

### API

#### cmd(options)

##### _options_

* map `Function`

  配置模块 `ID` 映射（返回的映射字符串必须符合文件路径规则，会同步更新模块 `ID` 和 输出文件名）。

* vars `Object`

  模块路径在运行时才能确定，这时可以使用 `vars` 变量来配置。

* paths `Object`

  当目录比较深，或需要跨目录调用模块时，可以使用 `paths` 来简化书写。

* alias `Object`

  当模块标识很长时，可以使用 `alias` 来简化。

  > 注意：_[css-loader](https://github.com/nuintun/css-loader) 为内置样式加载模块，建议配置 alias 以便正确的转换该模块，该模块需要自己下载并放入相应目录。 vars paths alias 可参考 [seajs](https://github.com/seajs/seajs/issues/262) 的配置_

* indent `Number`

  设置代码缩进，最小为 `0`，最大为 `10`。

* strict `Boolean`

  是否启用 `JavaScript` 严格模式。

* cache `Boolean`

  文件内存缓存，转换完成的文件会暂时存储在内存中以便提升转换效率。

* wwwroot `String`

  网站根目录配置，路径相对于 `process.cwd()` 目录。

* base `String`

  网站资源根目录配置，路径相对于 `wwwroot` 目录（相当于 `seajs` 的 `base`）， 如果不填写默认等于 `wwwroot`。

* plugins `Object`

  文件转换插件，可以覆写默认插件，也可定义新插件，匹配的 `vinyl` 文件会经过插件的转换函数，插件名字必须为不包含 `.` 文件扩展名。

* include `String`

  模块封装模式，默认 `relative`，可选 `all` 和 `self`。分别对应：（1）合并相对依赖文件。（2）合并所有依赖文件。（3）不合并任何文件。

* js `Object`

  转换 cmd 模块时的配置，有 `flags` 配置可选，配置类型为 `Array|Boolean`，用来控制是否转换类似 `require.async` 中的路径，可参考 `cmd-deps` 模块，默认转换 `async`。

* css `Object`

  转换 css 到 js 的配置，有 `onpath`， `loader` 和 `prefix` 三个配置可选，配置类型为 `Function|String|String`，对应 css 文件的资源文件路径处理，加载器路径和类名前缀。

* ignore `Array`

  模块合并需要忽略的依赖模块，支持路径和 vars paths alias 配置，不支持相对路径（默认忽略），以 `/` 开头的路径按照 wwwroot 寻找， 其他按照 base 寻找。

> 注意事项：_模块 id 以 `/` 结尾会默认用 `index.js` 或者 `index.css` 补全_， id 以 `/` 开头的模块会从 wwwroot 路径寻找。id 规则简化，不支持带 `search` 参数的用法，只支持标准路径，和 seajs 的[模块标识](https://github.com/seajs/seajs/issues/258)中有些区别。css 的 import 规则和原生一致，需要注意的是尽量不要引入远程资源。

[npm-image]: http://img.shields.io/npm/v/gulp-cmd.svg?style=flat-square
[npm-url]: https://www.npmjs.org/package/gulp-cmd
[download-image]: http://img.shields.io/npm/dm/gulp-cmd.svg?style=flat-square
[david-image]: http://img.shields.io/david/nuintun/gulp-cmd.svg?style=flat-square
[david-url]: https://david-dm.org/nuintun/gulp-cmd
