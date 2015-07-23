var module = angular.module("OpenChainWallet.Controllers");
var ByteBuffer = dcodeIO.ByteBuffer;
var Long = dcodeIO.Long;
var bitcore = require("bitcore");
var Mnemonic = require("bitcore-mnemonic");

// ***** HomeController *****
// **************************

module.controller("HomeController", function ($scope, $rootScope, $location, $route, $q, apiService, walletSettings, endpointManager, protobufBuilder, encodingService, validator, AssetData) {

    if (!walletSettings.initialized) {
        $location.path("/signin");
        return;
    }

    $rootScope.selectedTab = "home";

    $scope.rootAccount = walletSettings.rootAccount.toString();
    $scope.endpoints = endpointManager.endpoints;
    $scope.display = "home";

    // Load all assets in the account
    var balance = [];

    function loadEndpoint(key) {
        var endpoint = endpointManager.endpoints[key];
        var dataModel = {
            endpoint: endpoint,
            state: "loading",
            assets: []
        };
        balance.push(dataModel);
        apiService.getAccountAssets(endpoint, walletSettings.rootAccount).then(function (result) {
            for (var itemKey in result.data) {
                var assetData = new AssetData(endpoint, result.data[itemKey].asset);
                assetData.setAccountBalance(result.data[itemKey]);
                dataModel.assets.push(assetData);
            }

            dataModel.state = "loaded";
        }, function () {
            dataModel.state = "error";
        }).then(function () {
            return $q.all(dataModel.assets.map(function (asset) {
                return asset.fetchAssetDefinition();
            }));
        });
    }

    for (var key in endpointManager.endpoints) {
        loadEndpoint(key);
    }

    $scope.balance = balance;

    // Handle click on the asset item
    $scope.sendAsset = function (asset) {
        $scope.sendingAsset = asset;
        $scope.display = "send";
        $scope.asset = asset;
        $scope.sendStatus = "send-active";
    };

    // Handle sending the asset
    $scope.confirmSend = function (sendTo, sendAmountText) {
        var sendAmount = Long.fromString(sendAmountText);
        var endpoint = $scope.asset.endpoint;
        var asset = $scope.asset;

        apiService.getAccount(endpoint, sendTo, asset.asset)
            .then(function (destinationBalance) {
                var constructedTransaction = new protobufBuilder.Mutation({
                    "namespace": encodingService.encodeNamespace(endpoint.rootUrl),
                    "key_value_pairs": [
                        {
                            "key": encodingService.encodeAccount(walletSettings.rootAccount.toString(), asset.asset),
                            "value": encodingService.encodeInt64(asset["balance"].subtract(sendAmount)),
                            "version": asset["version"]
                        },
                        {
                            "key": destinationBalance.key,
                            "value": encodingService.encodeInt64(destinationBalance["balance"].add(sendAmount)),
                            "version": destinationBalance["version"]
                        },
                    ],
                    "metadata": ByteBuffer.fromHex("")
                });

                $scope.sendStatus = "send-wait";
                return apiService.postTransaction(endpoint, constructedTransaction, walletSettings.hdKey);
            })
            .then(function (data, status, headers, config) {
                $scope.display = "success";
            }, function (data, status, headers, config) {
                if (status == 400) {
                    $scope.display = "error";
                } else {
                    $scope.display = "error";
                }
            });
    };

    $scope.validateAmount = function (amount, control) {
        control.$setValidity("invalidNumber", validator.isNumber(amount));
    };

    $scope.cancelSend = function () {
        $route.reload();
    }
});
