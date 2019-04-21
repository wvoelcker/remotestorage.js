'use strict';

const log = require('./log');
const util = require('./util');
const WebFinger = require('webfinger.js');

// feature detection flags
var haveXMLHttpRequest, hasStorage;

// used to store settings in storage
var SETTINGS_KEY = 'remotestorage:discover';

// cache loaded from storage
var cachedInfo = {};

/**
 * This function deals with the Webfinger lookup, discovering a connecting
 * user's storage details.
 *
 * @param {string} userAddress - user@host
 *
 * @returns {Promise} A promise for an object with the following properties.
 *          href - Storage base URL,
 *          storageApi - RS protocol version,
 *          authUrl - OAuth URL,
 *          properties - Webfinger link properties
 **/

const Discover = function Discover(userAddress) {
  return new Promise((resolve, reject) => {

    if (userAddress in cachedInfo) {
      return resolve(cachedInfo[userAddress]);
    }

    var webFinger = new WebFinger({
      tls_only: false,
      uri_fallback: true,
      request_timeout: 5000
    });

    return webFinger.lookup(userAddress, function (err, response) {
      if (err) {
        return reject(err);
      } else if ((typeof response.idx.links.remotestorage !== 'object') ||
                 (typeof response.idx.links.remotestorage.length !== 'number') ||
                 (response.idx.links.remotestorage.length <= 0)) {
        log("[Discover] WebFinger record for " + userAddress + " does not have remotestorage defined in the links section ", JSON.stringify(response.json));
        return reject("WebFinger record for " + userAddress + " does not have remotestorage defined in the links section.");
      }

      var rs = response.idx.links.remotestorage[0];
      var authURL = rs.properties['http://tools.ietf.org/html/rfc6749#section-4.2'] ||
                    rs.properties['auth-endpoint'];
      var storageApi = rs.properties['http://remotestorage.io/spec/version'] ||
                       rs.type;

      // cache fetched data
      cachedInfo[userAddress] = {
        href: rs.href,
        storageApi: storageApi,
        authURL: authURL,
        properties: rs.properties
      };

      if (hasStorage) {
        util.setInStorage(SETTINGS_KEY, JSON.stringify({ cache: cachedInfo }), rs.getPersistState());
      }

      return resolve(cachedInfo[userAddress]);
    });
  });
};

Discover.DiscoveryError = function(message) {
  this.name = 'DiscoveryError';
  this.message = message;
  this.stack = (new Error()).stack;
};
Discover.DiscoveryError.prototype = Object.create(Error.prototype);
Discover.DiscoveryError.prototype.constructor = Discover.DiscoveryError;

Discover._rs_init = function (/*remoteStorage*/) {
  hasStorage = util.storageAvailable();
  if (hasStorage) {
    const settings = util.getJSONFromStorage(SETTINGS_KEY);
    if (settings) {
      cachedInfo = settings.cache;
    }
  }
};

Discover._rs_supported = function () {
  haveXMLHttpRequest = !! util.globalContext.XMLHttpRequest;
  return haveXMLHttpRequest;
};

Discover._rs_cleanup = function () {
  if (hasStorage) {
    util.removeFromStorage(SETTINGS_KEY);
  }
};


module.exports = Discover;
