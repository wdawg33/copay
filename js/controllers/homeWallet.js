'use strict';

angular.module('copayApp.controllers').controller('HomeWalletController', function($scope, $rootScope, $timeout, $filter, $modal, rateService, notification, txStatus, identityService) {
  $scope.initHome = function() {
    var w = $rootScope.wallet;

    $rootScope.title = 'Home';
    $scope.rateService = rateService;
    $scope.isRateAvailable = false;

    if (w.isShared())
      $scope.copayers = w.getRegisteredPeerIds();

     w.on('txProposalEvent', _updateTxs);
    _updateTxs();

    rateService.whenAvailable(function() {
      $scope.isRateAvailable = true;
      $scope.$digest();
    });
  };

  // This is necessary, since wallet can change in homeWallet, 
  // without running init() again.
  
  var removeWatch;
  removeWatch = $rootScope.$watch('wallet.id', function(newWallet, oldWallet) {
    if ($rootScope.wallet && $rootScope.wallet.isComplete() && newWallet !== oldWallet) {

      if (removeWatch)
        removeWatch();

      if (oldWallet) {
        var oldw = $rootScope.iden.getWalletById(oldWallet);
        if (oldw)
          oldw.removeListener('txProposalEvent', _updateTxs);
      }


      var w = $rootScope.wallet;
      $rootScope.pendingTxCount = 0;
      w.on('txProposalEvent', _updateTxs);
      _updateTxs();
    }
  });

    $scope.$on("$destroy", function() {
    var w = $rootScope.wallet;
    if (w) {
      removeWatch();
      w.removeListener('txProposalEvent', _updateTxs);
    };
  }); 

  $scope.setAlternativeAmount = function(w, tx, cb) {
    rateService.whenAvailable(function() {
      _.each(tx.outs, function(out) {
        var valueSat = out.valueSat * w.settings.unitToSatoshi;
        out.alternativeAmount = $filter('noFractionNumber')(rateService.toFiat(valueSat, $scope.alternativeIsoCode), 2);
        out.alternativeIsoCode = $scope.alternativeIsoCode;
      });
      if (cb) return cb(tx);
    });
  };

  var _updateTxs = _.throttle(function() {
    var w = $rootScope.wallet;
    if (!w) return;

    $scope.alternativeIsoCode = w.settings.alternativeIsoCode;
    $scope.myId = w.getMyCopayerId();

    var res = w.getPendingTxProposals();
    _.each(res.txs, function(tx) {
      $scope.setAlternativeAmount(w, tx);
      if (tx.merchant) {
        var url = tx.merchant.request_url;
        var domain = /^(?:https?)?:\/\/([^\/:]+).*$/.exec(url)[1];
        tx.merchant.domain = domain;
      }
      if (tx.outs) {
        _.each(tx.outs, function(out) {
          out.valueSat = out.value;
          out.value = $filter('noFractionNumber')(out.value);
        });
      }
    });
    $scope.txps = res.txs;
    $timeout(function(){
      $scope.$digest();
    },1)
  }, 100);

  $scope.sign = function(ntxid) {
    var w = $rootScope.wallet;
    $scope.loading = true;
    $scope.error = $scope.success = null;
    w.signAndSend(ntxid, function(err, id, status) {
      $scope.loading = false;
      if (!txStatus.notify(status))
        $scope.error = status;
      _updateTxs();
    });
  };

  $scope.reject = function(ntxid) {
    var w = $rootScope.wallet;
    w.reject(ntxid);
    txStatus.notify('txRejected');
    _updateTxs();
  };


  $scope.openTxModal = function(tx) {
    var ModalInstanceCtrl = function($scope, $modalInstance) {
      $scope.tx = tx;

      $scope.getShortNetworkName = function() {
        var w = $rootScope.wallet;
        return w.getNetworkName().substring(0, 4);
      };

      $scope.cancel = function() {
        $modalInstance.dismiss('cancel');
      };
    };

    $modal.open({
      templateUrl: 'views/modals/txp-details.html',
      windowClass: 'tiny',
      controller: ModalInstanceCtrl,
    });
  };



});