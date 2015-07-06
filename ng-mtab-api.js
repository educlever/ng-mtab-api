"use strict";

(function (angular) {

    var module = angular.module("educ.ngMtabApi", [
        "educ.ngJsonRpc",
        "educ.ngStorage"
    ]);

    module.run(["$rootScope", function ($rootScope) {
        $rootScope.$on('$stateChangeStart', function () {
            mxc_son_stop();
        });
    }]);

    module.filter('trusted', ['$sce', function ($sce) {
        return function (text) {
            return $sce.trustAsHtml(text);
        };
    }]);

    module.provider("MtabApi", function () {

        var url, urlEid;
        var rpc;
        var userModel;
        // var cordovaLocalPath; // not used for web
        var service = {};
        var useCache = true;
        var persistent = true;
        var lastReconnectTime = 0;

        this.setMainUrl = function (x) {
            url = x;
            return this;
        };
        this.setEidUrl = function (x) {
            urlEid = x;
            return this;
        };
        this.setPersistent = function (x) {
            persistent = !!x;
            return this;
        };
        this.useCache = function (x) {
            useCache = !!x;
            return this;
        };

        this.$get = ["$rootScope", "$http", "$q", "JsonRpc", "StorageService", function ($rootScope, $http, $q, JsonRpc, storage) {
            rpc = JsonRpc.entrypoint(url);

            if (persistent) {
                retreiveUsermodel();
            } else {
                forgetUserModel();
                forgetSessionId();
            }

            service.tryToReuseExistingSession = function () {
                var defered = $q.defer();
                $http.get(urlEid, {withCredentials: true})
                    .success(function (data, status, headers, config) {
                        if (!data || !(200 <= status && status <= 299)) {
                            defered.reject(status);
                        } else {
                            defered.resolve(data);
                        }
                    })
                    .error(function (data, status, headers, config) {
                        defered.reject(status);
                    });
                return defered.promise.then(function (session) {
                    if (session) {
                        forgetSessionId();
                        rememberSessionId(session);
                        var defered = $q.defer();
                        service.call("MTAB_User::current", [])
                            .promise
                            .then(function (userData) {
                                setUserModel(new UserModel(userData));
                                forgetSessionId();
                                rememberSessionId(userModel.session);
                                console.log("MtabApi reused user", userModel);
                                defered.resolve(getUserModel());
                            }, function () {
                                console.log("MtabApi can't reuse a user (no current user in existing session)");
                                defered.resolve(false);
                            });
                        return defered.promise;
                    } else {
                        console.log("MtabApi can't reuse a user (no existing session)");
                        return false;
                    }
                });
            };

            service.useCache = function (x) {
                useCache = !!x;
                return this;
            };

            service.hasUser = function () {
                return !!userModel && !!userModel.uid && !!userModel.uref;
            };

            service.getUser = function () {
                return getUserModel();
            };

            service.changeClasse = function (classeMeta) {
                if (service.hasUser()) {
                    return getUserModel().changeClasse(classeMeta);
                }
                throw "can't change classe without user";
            };

            service.canReconnect = function () {
                return service.hasUser() && (2 < (timestamp() - lastReconnectTime));
            };

            service.strongAuthent = function (login, password, classeMeta) {
//            forgetSessionId(); // Non ! = limiter le nombre d'ouverture de session côté serveur
                return service.call("MTAB_User::strongAuthent", [login, password, classeMeta])
                    .promise
                    .then(function (userData) {
                        setUserModel(new UserModel(userData));
                        forgetSessionId();
                        rememberSessionId(userModel.session);
                        console.log("MtabApi strongAuthent", userModel);
                        return getUserModel();
                    });
            };

            service.weakAuthent = function (uid, uref, classeMeta) {
//            forgetSessionId(); // Non ! = limiter le nombre d'ouverture de session côté serveur
                return service.call("MTAB_User::weakAuthent", [uid, uref, classeMeta])
                    .promise
                    .then(function (userData) {
                        // FSI 2015-06-17 15:35:49 : ne pas créer un nouvel objet
                        // si on en a déjà un pour que l'éventuel usage dans un $scope
                        // ne soit pas perturbé.
                        var userModel, k;
                        if (hasUserModel()) {
                            userModel = getUserModel();
                            for (k in userModel) {
                                delete userModel[k];
                            }
                            for (k in userData) {
                                userModel[k] = userData[k];
                            }
                        } else {
                            userModel = new UserModel(userData);
                        }
                        setUserModel(userModel);
                        forgetSessionId();
                        rememberSessionId(userModel.session);
                        console.log("MtabApi weakAuthent", userModel);
                        return getUserModel();
                    });
            };

            service.logout = function () {
                return service.call("MTAB_User::logout", [])
                    .promise
                    .then(function () {
                        forgetUserModel();
//                    forgetSessionId(); // Non ! = limiter le nombre d'ouverture de session côté serveur
                    });
            };

            service.arboGetAllClasses = function () {
                var cacheRepo = "miscCache";
                var cacheKey = "allClasses";
                if (useCache && cacheHas(cacheRepo, cacheKey)) {
                    return cacheResolved(cacheGet(cacheRepo, cacheKey));
                }
                return service.call("MTAB_Arbo::getAllClasses", [])
                    .promise
                    .then(function (allClasses) {
                        if (useCache) {
                            cacheSet(cacheRepo, cacheKey, allClasses);
                        }
                        return allClasses;
                    });
            };

            service.arboGet = function (boId) {
                var cacheRepo = "arboCache";
                var classeMeta = getUserModel().classe.meta;
                var cacheKey = classeMeta + '-' + boId;
                if (useCache && cacheHas(cacheRepo, cacheKey)) {
                    return cacheResolved(new ArboModel(cacheGet(cacheRepo, cacheKey)));
                }
                return service.withAutoReconnect(function () {
                    return service.call("MTAB_Arbo::get", [boId])
                        .promise
                        .then(function (arboData) {
                            var arboModel = new ArboModel(arboData);
                            if (useCache) {
                                cacheSet(cacheRepo, cacheKey, arboModel);
                            }
                            return arboModel;
                        });
                });
            };

            service.arboGetMany = function (boIds) {
                if (!angular.isArray(boIds) && angular.isString(boIds)) {
                    boIds = boIds.split(/\D+/);
                }

                var classeMeta = getUserModel().classe.meta;
                var cacheRepo = "arboCache";
                var foundArboModelsById = {};
                var missingBoIds = [];
                var promise;
                boIds.forEach(function (boId) {
                    if (useCache) {
                        var cacheKey = classeMeta + '-' + boId;
                        if (cacheHas(cacheRepo, cacheKey)) {
                            foundArboModelsById[boId] = new ArboModel(cacheGet(cacheRepo, cacheKey));
                        } else {
                            missingBoIds.push(boId);
                        }
                    } else {
                        missingBoIds.push(boId);
                    }
                });
                if (missingBoIds.length) {
                    promise = service.withAutoReconnect(function () {
                        return service.call("MTAB_Arbo::getMany", [missingBoIds])
                            .promise
                            .then(function (arboDataList) {
                                arboDataList.forEach(function (arboData) {
                                    var arboModel = new ArboModel(arboData);
                                    if (useCache) {
                                        var cacheKey = classeMeta + '-' + arboModel.boId;
                                        cacheSet(cacheRepo, cacheKey, arboModel);
                                    }
                                    foundArboModelsById[arboModel.boId] = arboModel;
                                });
                                return foundArboModelsById;
                            });
                    });
                } else {
                    promise = cacheResolved(foundArboModelsById);
                }
                // Important ! remettre les arboModels dans l'ordre de la demande (l'ordre des boIds);
                return promise.then(function (foundArboModelsById) {
                    var arboModels = [];
                    boIds.forEach(function (boId) {
                        arboModels.push(foundArboModelsById[boId]);
                    });
                    return arboModels;
                });
            };

            service.opdGet = function (opdId) {
                var cacheRepo = "opdCache";
                var cacheKey = opdId;
                if (useCache && cacheHas(cacheRepo, cacheKey)) {
                    return cacheResolved(new OpdModel(cacheGet(cacheRepo, cacheKey)));
                }
                return service.withAutoReconnect(function () {
                    return service.call("MTAB_Opd::get", [opdId])
                        .promise
                        .then(function (opdData) {
                            var opdModel = new OpdModel(opdData);
                            if (useCache) {
                                cacheSet(cacheRepo, cacheKey, opdModel);
                            }
                            return opdModel;
                        });
                });
            };

            service.opdGetMany = function (opdIds) {
                if (!angular.isArray(opdIds) && angular.isString(opdIds)) {
                    opdIds = opdIds.split(/\D+/);
                }

                var cacheRepo = "opdCache";
                var foundOpdModelsById = [];
                var missingOpdIds = [];
                var promise;
                opdIds.forEach(function (opdId) {
                    if (useCache) {
                        if (cacheHas(cacheRepo, opdId)) {
                            foundOpdModelsById[opdId] = new OpdModel(cacheGet(cacheRepo, opdId));
                        } else {
                            missingOpdIds.push(opdId);
                        }
                    } else {
                        missingOpdIds.push(opdId);
                    }
                });
                if (missingOpdIds.length) {
                    promise = service.withAutoReconnect(function () {
                        return service.call("MTAB_Opd::getMany", [missingOpdIds])
                            .promise
                            .then(function (opdDataList) {
                                opdDataList.forEach(function (opdData) {
                                    var opdModel = new OpdModel(opdData);
                                    if (useCache) {
                                        cacheSet(cacheRepo, opdModel.opdId, opdModel);
                                    }
                                    foundOpdModelsById[opdModel.opdId] = opdModel;
                                });
                                return foundOpdModelsById;
                            });
                    });
                } else {
                    promise = cacheResolved(foundOpdModelsById);
                }
                // Important ! remettre les opdModels dans l'ordre de la demande (l'ordre des opdIds);
                return promise.then(function (foundOpdModelsById) {
                    var opdModels = [];
                    opdIds.forEach(function (opdId) {
                        opdModels.push(foundOpdModelsById[opdId]);
                    });
                    return opdModels;
                });

            };

            service.dateToSqlDatetime = function (d) {
                return d instanceof Date ? [
                    [d.getFullYear(), padZero(d.getMonth() + 1), padZero(d.getDate())].join("-"),
                    [padZero(d.getHours()), padZero(d.getMinutes()), padZero(d.getSeconds())].join(":")
                ].join(" ") : d;
            };

            service.traceGetPeriode = function (actorId, dateBegin, dateEnd) {
                var dt1 = service.dateToSqlDatetime(dateBegin);
                var dt2 = service.dateToSqlDatetime(dateEnd);
                return service.withAutoReconnect(function () {
                    return service.call("MTAB_Trace::getPeriode", [actorId, dt1, dt2])
                        .promise
                        .then(function (obsels) {
                            return obsels;
                        });
                });
            };

            service.showSoundButtons = function () {
                var $buttons = jQuery(document.body).find('[data-opd-id] a[onclick^="mxc_son"]');
                $buttons.show();
            };
            service.hideSoundButtons = function () {
                var $buttons = jQuery(document.body).find('[data-opd-id] a[onclick^="mxc_son"]');
                $buttons.hide();
            };

            service.call = function () {
                return rpc.call.apply(rpc, arguments);
            };

            service.withAutoReconnect = function (job) {
                var defered = $q.defer();
                job().then(defered.resolve, function (error) {
                    if (needsSession(error)) {
                        console.log("MtabApi : trying to auto-reconnect...");
                        if (service.canReconnect()) {
                            console.log("MtabApi : reconnection...");
                            lastReconnectTime = timestamp();
                            service.weakAuthent(userModel.uid, userModel.uref, userModel.classe.meta)
                                .then(function () {
                                    job().then(defered.resolve, defered.reject);
                                })
                                .catch(defered.reject)
                            ;
                        } else {
                            console.log("MtabApi : can't reconnect");
                            defered.reject(e("please-wait", "withAutoReconnect"));
                        }
                    } else {
                        defered.reject(error);
                    }
                });
                return defered.promise;
            };

            // helpers

            function padZero(num) {
                return (num >= 0 && num < 10) ? "0" + num : num + "";
            }

            function e(code, method) {
                return {
                    error: code,
                    module: "MtabApi",
                    method: method
                };
            }

            function timestamp() {
                return (new Date()).getTime() / 1000;
            }

            function needsSession(error) {
                return (error && error.error && error.error == "no-session");
            }

            function rememberSessionId(session) {
                if (!rpc.url.match(/_eid=/)) {
                    rpc.url += (rpc.url.match(/\?/) ? "&" : "?");
                    rpc.url += session;
                }
                console.log("MtabApi JSON-RPC url", rpc.url);
                return true;
            }

            function forgetSessionId() {
                if (rpc.url.match(/_eid=/)) {
                    rpc.url = rpc.url.replace(/_eid=\w*/, "");
                    rpc.url = rpc.url.replace(/\?$/, "");
                    rpc.url = rpc.url.replace(/&$/, "");
                }
                console.log("MtabApi JSON-RPC url", rpc.url);
                return true;
            }

            function forgetUserModel() {
                window.userModel = userModel = null;
                sessionStorage.removeItem("mtab-user");
                return true;
            }

            function setUserModel(x) {
                if (x instanceof UserModel) {
                    window.userModel = userModel = x;
                    if (persistent) {
                        sessionStorage.setItem("mtab-user", JSON.stringify(userModel));
                    }
                    return true;
                }
                throw "MtabApi setUserModel must have a UserModel !";
            }

            function retreiveUsermodel() {
                var userData = null;
                try {
                    eval("userData = " + sessionStorage.getItem("mtab-user"));
                } catch (e) {
                }
                if (!!userData) {
                    setUserModel(new UserModel(userData));
                    !!userData.session && forgetSessionId() && rememberSessionId(userData.session);
                }
            }

            function hasUserModel() {
                return userModel instanceof UserModel;
            }

            function getUserModel() {
                if (userModel instanceof UserModel) {
                    return userModel;
                }
                throw "MtabApi getUserModel must have a UserModel !";
            }

            function cacheSet(cache, key, value) {
                var storageKey = cache + '-' + key;
                try {
                    storage.setItem(storageKey, JSON.stringify(value));
                } catch (e) {
                    alert("cache : storage.clearMatching ^" + cache + "-");
                    cacheClearMatching(storage, new RegExp("^" + cache + "-"));
                    storage.setItem(storageKey, JSON.stringify(value));
                }
            }

            function cacheClearMatching(storage, re) {
                for (var key in storage) {
                    if (storage.hasOwnProperty(key) && key.match(re)) {
                        storage.removeItem(key);
                    }
                }
            }

            function cacheGet(cache, key) {
                var storageKey = cache + '-' + key;
                var value;
                try {
                    var json = storage.getItem(storageKey);
                    eval("value = " + json);
                } catch (e) {
                }
                return value;
            }

            function cacheHas(cache, key) {
                var storageKey = cache + '-' + key;
                return !!storage.getItem(storageKey);
            }

            function cacheRemove(cache, key) {
                var storageKey = cache + '-' + key;
                storage.removeItem(storageKey);
            }

            function cacheResolved(value) {
                var defered = $q.defer();
                defered.resolve(value);
                return defered.promise;
            }

            function UserModel(data) {
                angular.copy(data, this);
            }

            UserModel.prototype.logout = function () {
                return service.logout();
            };

            // TODO cache ?
            UserModel.prototype.getAllClasses = function (levels) {
                // levels : primaire college lycee fprof (string ou tableau de string)
                return service.withAutoReconnect(function () {
                    return service.call("MTAB_User::getAllClasses", [levels])
                        .promise
                        .then(function (classes) {
                            return classes;
                        });
                });
            };

            UserModel.prototype.changeClasse = function (classeMeta) {
                return service.withAutoReconnect(function () {
                    return service.call("MTAB_User::changeClasse", [classeMeta])
                        .promise
                        .then(function (userData) {
                            var userModel = getUserModel(), k;
                            for (k in userModel) {
                                delete userModel[k];
                            }
                            for (k in userData) {
                                userModel[k] = userData[k];
                            }
                            setUserModel(userModel);
                            console.log("MtabApi changeClasse", userModel);
                            return userModel;
                        });
                });
            };

            UserModel.prototype.getMiddleClasseMeta = function () {
                var index = Math.max(0, Math.min(this.classes.length - 1, Math.floor(this.classes.length / 2)));
                return this.classes[index].meta;
            };

            UserModel.prototype.obselify = function (obsel) {
                if (!obsel.name) {
                    console.error("bad obsel : missing name", obsel);
                    throw "bad-obselify";
                }
                if (!obsel.clientTimestamp) {
                    obsel.clientTimestamp = (new Date()).getTime() / 1000;
                }
                if (!obsel.clientTime) {
                    obsel.clientTimestamp = (new Date(obsel.clientTimestamp * 1000)).toUTCString();
                }

                if (!this.$windowId) {
                    var _ = this.session.match(/eid=(\S+)/);
                    this.$windowId = _[1];
                }
                obsel.windowId = this.$windowId;
                return obsel;
            };

            function processNotifications(user, notifications) {
                var list = notifications.notifications;
                if (list.length == 0) {
                    if (!!notifications.lastNotificationId && user.$notificationsLastReceivedId < notifications.lastNotificationId) {
                        user.$notificationsLastReceivedId = notifications.lastNotificationId;
                    }
                } else {
                    var acknowledges = [], byName = {}, name;
                    // groupe les notification par "name"
                    list.forEach(function (notification) {
                        acknowledges.push({'name': 'system-notification-acknowledge', notificationId: notification.id});
                        name = notification.name;
                        if (!byName[name]) {
                            byName[name] = [];
                        }
                        byName[name].push(notification);
                    });
                    user.$notificationsLastReceivedId = list[list.length - 1].id;
                    // déclenche les "actions sur notification" par type de notification
                    for (name in byName) {
                        if (byName.hasOwnProperty(name)) {
                            $rootScope.$broadcast(name, byName[name]);
                        }
                    }
                    user.sendObsels(acknowledges);
                }
            }

            UserModel.prototype.sendObsels = function (obsels) {
                var _this = this;
                obsels.forEach(function (obsel) {
                    _this.obselify(obsel);
                });
                return service.call("MTAB_Trace::receiveObsels", [obsels, this.$windowId, this.$notificationsLastReceivedId || null])
                    .promise
                    .then(function (notifications) {
                        return processNotifications(_this, notifications);
                    });
            };

            UserModel.prototype.sendObsel = function (obsel) {
                this.obselify(obsel);
                var _this = this;
                return service.call("MTAB_Trace::receiveObsel", [obsel, this.$windowId, this.$notificationsLastReceivedId || null])
                    .promise
                    .then(function (notifications) {
                        return processNotifications(_this, notifications);
                    });
            };

            function ArboModel(data) {
                angular.copy(data, this);
            }

            ArboModel.prototype.fetchChild = function (boId) {
                var _this = this;
                var found = false;
                var deferred;
                this.childs.forEach(function (child, index) {
                    if (child.boId == boId) {
                        found = index;
                    }
                });
                if (found !== false) {
                    if (_this.childs[found] instanceof ArboModel) {
                        deferred = $q.defer();
                        deferred.resolve(_this.childs[found]);
                        return deferred.promise;
                    } else {
                        return service.arboGet(boId)
                            .then(function (arboModel) {
                                _this.childs[found] = arboModel;
                            });
                    }
                }
                throw "child-not-found";
            };

            ArboModel.prototype.fetchChilds = function () {
                var deferred;
                if (this.$fetchChilds) {
                    deferred = $q.defer();
                    deferred.resolve(this.childs);
                    return deferred.promise;
                }
                var _this = this;
                var boIds = [];
                this.childs.forEach(function (child) {
                    boIds.push(child.boId);
                });
                if (boIds.length) {
                    return service.arboGetMany(boIds)
                        .then(function (arboModels) {
                            // branche le fils dans le parent
                            arboModels.forEach(function (arboModel, index) {
                                _this.childs[index] = arboModel;
                            });
                            // mémorise que ce fetch est fait (évitera de le refaire)
                            _this.$fetchChilds = true;
                            // retourne les fils
                            return arboModels;
                        });
                } else {
                    deferred = $q.defer();
                    deferred.resolve([]);
                    return deferred.promise;
                }
            };

            function OpdModel(data) {
                angular.copy(data, this);

                if (!!this.answers) {
                    this.answers.forEach(function (answer, index) {
                        answer.indexInOpd = index;
                    });
                }

                var re = new RegExp("opd/" + this.opdId + "/", "g");
                var url = "http://e.maxicours.com/";
                this.recursiveWalk(function (x, index) {
                    if (index == "html") {
                        x[index] = x[index].replace(re, url);
                    }
                }, this);
            }

            OpdModel.prototype.recursiveWalk = function (fn, x) {
                var _this = this;
                if (angular.isArray(x)) {
                    x.forEach(function (v, i) {
                        fn(x, i);
                        _this.recursiveWalk(fn, x[i]);
                    });
                } else if (angular.isObject(x)) {
                    for (var i in x) {
                        if (x.hasOwnProperty(i)) {
                            fn(x, i);
                            _this.recursiveWalk(fn, x[i]);
                        }
                    }
                }
            };

            return service;
        }];

    });
})(angular);

var audioPlayer;
var audioPlayerCurrentUrl;
function mxc_son_stop() {
    if (audioPlayer) {
        audioPlayer.pause();
        audioPlayer = null;
        audioPlayerCurrentUrl = null;
    }
}
function mxc_son(id, url) {
    var canPlay = true;
    if (audioPlayer) {
        audioPlayer.pause();
        audioPlayer = null;
        canPlay = audioPlayerCurrentUrl != url;
        audioPlayerCurrentUrl = null;
    }
    if (canPlay) {
        if (!!window["cordova"]) {
            // https://github.com/apache/cordova-plugin-media/blob/master/doc/index.md
            audioPlayer = new Media(url);
        } else {
            audioPlayer = new Audio(url);
        }
        audioPlayerCurrentUrl = url;
        audioPlayer.play();
    }
}

function cours_fiche_lien() {
}
function dic_voc_offline() {
}
function dic_voc_inline() {
}
