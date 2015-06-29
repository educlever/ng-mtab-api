EduClever Angular 1.x MTAB API
==============================

Getting Started
---------------
Install the library through bower.
```js
bower install --save educlever/ng-mtab-api
```
Include the scripts in your html file.
```html
<script src="bower_components/ng-storage/ng-storage.min.js"></script>
<script src="bower_components/ng-jsonrpc/ng-jsonrpc.min.js"></script>
<script src="bower_components/ng-mtab-api/ng-mtab-api.min.js"></script>
```

Include the style in your html file.
```html
<link rel="stylesheet" href="bower_components/ng-mtab-api/opd.css" type="text/css"/>
```

Add it to your module's dependencies.
```js
angular.module('myapp', [
    'educ.ngStorage',
    'educ.ngJsonRpc',
    'educ.ngMtabApi'
]);
```

Configure the service
```js
angular.module('myapp').config(['MtabApiProvider', function(MtabApiProvider) {
    MtabApiProvider.setPersistent(true);
    MtabApiProvider.useCache(true);
    MtabApiProvider.setUrl("http://www.maxicours.com/W/rpc/mobilite/mtab.php");
});
```
