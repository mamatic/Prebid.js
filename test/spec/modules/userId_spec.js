import {
  init,
  requestBidsHook,
  setSubmoduleRegistry,
  syncDelay,
  attachIdSystem
} from 'modules/userId';
import {config} from 'src/config';
import * as utils from 'src/utils';
import {unifiedIdSubmodule} from 'modules/unifiedIdSystem';
import {pubCommonIdSubmodule} from 'modules/pubCommonIdSystem';
import {idLinkSubmodule} from 'modules/idLinkSystem';
let assert = require('chai').assert;
let expect = require('chai').expect;
const EXPIRED_COOKIE_DATE = 'Thu, 01 Jan 1970 00:00:01 GMT';

describe('User ID', function() {
  function getConfigMock(configArr1, configArr2, configArr3) {
    return {
      userSync: {
        syncDelay: 0,
        userIds: [
          (configArr1 && configArr1.length === 3) ? getStorageMock.apply(null, configArr1) : null,
          (configArr2 && configArr2.length === 3) ? getStorageMock.apply(null, configArr2) : null,
          (configArr3 && configArr3.length === 3) ? getStorageMock.apply(null, configArr3) : null
        ].filter(i => i)}
    }
  }
  function getStorageMock(name = 'pubCommonId', key = 'pubcid', type = 'cookie', expires = 30) {
    return { name: name, storage: { name: key, type: type, expires: expires } }
  }

  function getAdUnitMock(code = 'adUnit-code') {
    return {
      code,
      mediaTypes: {banner: {}, native: {}},
      sizes: [[300, 200], [300, 600]],
      bids: [{bidder: 'sampleBidder', params: {placementId: 'banner-only-bidder'}}]
    };
  }

  before(function() {
    utils.setCookie('_pubcid_optout', '', EXPIRED_COOKIE_DATE);
    localStorage.removeItem('_pbjs_id_optout');
    localStorage.removeItem('_pubcid_optout');
  });

  describe('Decorate Ad Units', function() {
    beforeEach(function() {
      utils.setCookie('pubcid', '', EXPIRED_COOKIE_DATE);
      utils.setCookie('pubcid_alt', 'altpubcid200000', (new Date(Date.now() + 5000).toUTCString()));
    });

    afterEach(function () {
      $$PREBID_GLOBAL$$.requestBids.removeAll();
      config.resetConfig();
    });

    after(function() {
      utils.setCookie('pubcid', '', EXPIRED_COOKIE_DATE);
      utils.setCookie('pubcid_alt', '', EXPIRED_COOKIE_DATE);
    });

    it('Check same cookie behavior', function () {
      let adUnits1 = [getAdUnitMock()];
      let adUnits2 = [getAdUnitMock()];
      let innerAdUnits1;
      let innerAdUnits2;

      let pubcid = utils.getCookie('pubcid');
      expect(pubcid).to.be.null; // there should be no cookie initially

      setSubmoduleRegistry([pubCommonIdSubmodule, unifiedIdSubmodule]);
      init(config);
      config.setConfig(getConfigMock(['pubCommonId', 'pubcid', 'cookie']));

      requestBidsHook(config => { innerAdUnits1 = config.adUnits }, {adUnits: adUnits1});
      pubcid = utils.getCookie('pubcid'); // cookies is created after requestbidHook

      innerAdUnits1.forEach(unit => {
        unit.bids.forEach(bid => {
          expect(bid).to.have.deep.nested.property('userId.pubcid');
          expect(bid.userId.pubcid).to.equal(pubcid);
        });
      });

      requestBidsHook(config => { innerAdUnits2 = config.adUnits }, {adUnits: adUnits2});
      assert.deepEqual(innerAdUnits1, innerAdUnits2);
    });

    it('Check different cookies', function () {
      let adUnits1 = [getAdUnitMock()];
      let adUnits2 = [getAdUnitMock()];
      let innerAdUnits1;
      let innerAdUnits2;
      let pubcid1;
      let pubcid2;

      setSubmoduleRegistry([pubCommonIdSubmodule, unifiedIdSubmodule]);
      init(config);
      config.setConfig(getConfigMock(['pubCommonId', 'pubcid', 'cookie']));
      requestBidsHook((config) => { innerAdUnits1 = config.adUnits }, {adUnits: adUnits1});
      pubcid1 = utils.getCookie('pubcid'); // get first cookie
      utils.setCookie('pubcid', '', EXPIRED_COOKIE_DATE); // erase cookie

      innerAdUnits1.forEach((unit) => {
        unit.bids.forEach((bid) => {
          expect(bid).to.have.deep.nested.property('userId.pubcid');
          expect(bid.userId.pubcid).to.equal(pubcid1);
        });
      });

      setSubmoduleRegistry([pubCommonIdSubmodule, unifiedIdSubmodule]);
      init(config);
      config.setConfig(getConfigMock(['pubCommonId', 'pubcid', 'cookie']));
      requestBidsHook((config) => { innerAdUnits2 = config.adUnits }, {adUnits: adUnits2});

      pubcid2 = utils.getCookie('pubcid'); // get second cookie

      innerAdUnits2.forEach((unit) => {
        unit.bids.forEach((bid) => {
          expect(bid).to.have.deep.nested.property('userId.pubcid');
          expect(bid.userId.pubcid).to.equal(pubcid2);
        });
      });

      expect(pubcid1).to.not.equal(pubcid2);
    });

    it('Check new cookie', function () {
      let adUnits = [getAdUnitMock()];
      let innerAdUnits;

      setSubmoduleRegistry([pubCommonIdSubmodule, unifiedIdSubmodule]);
      init(config);
      config.setConfig(getConfigMock(['pubCommonId', 'pubcid_alt', 'cookie']));
      requestBidsHook((config) => { innerAdUnits = config.adUnits }, {adUnits});
      innerAdUnits.forEach((unit) => {
        unit.bids.forEach((bid) => {
          expect(bid).to.have.deep.nested.property('userId.pubcid');
          expect(bid.userId.pubcid).to.equal('altpubcid200000');
        });
      });
    });
  });

  describe('Opt out', function () {
    before(function () {
      utils.setCookie('_pbjs_id_optout', '1', (new Date(Date.now() + 5000).toUTCString()));
    });

    beforeEach(function () {
      sinon.stub(utils, 'logInfo');
    });

    afterEach(function () {
      // removed cookie
      utils.setCookie('_pbjs_id_optout', '', EXPIRED_COOKIE_DATE);
      $$PREBID_GLOBAL$$.requestBids.removeAll();
      utils.logInfo.restore();
      config.resetConfig();
    });

    after(function () {
      utils.setCookie('_pbjs_id_optout', '', EXPIRED_COOKIE_DATE);
    });

    it('fails initialization if opt out cookie exists', function () {
      setSubmoduleRegistry([pubCommonIdSubmodule, unifiedIdSubmodule]);
      init(config);
      config.setConfig(getConfigMock(['pubCommonId', 'pubcid', 'cookie']));
      expect(utils.logInfo.args[0][0]).to.exist.and.to.equal('User ID - opt-out cookie found, exit module');
    });

    it('initializes if no opt out cookie exists', function () {
      setSubmoduleRegistry([pubCommonIdSubmodule, unifiedIdSubmodule]);
      init(config);
      config.setConfig(getConfigMock(['pubCommonId', 'pubcid', 'cookie']));
      expect(utils.logInfo.args[0][0]).to.exist.and.to.equal('User ID - usersync config updated for 1 submodules');
    });
  });

  describe('Handle variations of config values', function () {
    beforeEach(function () {
      sinon.stub(utils, 'logInfo');
    });

    afterEach(function () {
      $$PREBID_GLOBAL$$.requestBids.removeAll();
      utils.logInfo.restore();
      config.resetConfig();
    });

    it('handles config with no usersync object', function () {
      setSubmoduleRegistry([pubCommonIdSubmodule, unifiedIdSubmodule]);
      init(config);
      config.setConfig({});
      // usersync is undefined, and no logInfo message for 'User ID - usersync config updated'
      expect(typeof utils.logInfo.args[0]).to.equal('undefined');
    });

    it('handles config with empty usersync object', function () {
      setSubmoduleRegistry([pubCommonIdSubmodule, unifiedIdSubmodule]);
      init(config);
      config.setConfig({ usersync: {} });
      expect(typeof utils.logInfo.args[0]).to.equal('undefined');
    });

    it('handles config with usersync and userIds that are empty objs', function () {
      setSubmoduleRegistry([pubCommonIdSubmodule, unifiedIdSubmodule]);
      init(config);
      config.setConfig({
        usersync: {
          userIds: [{}]
        }
      });
      expect(typeof utils.logInfo.args[0]).to.equal('undefined');
    });

    it('handles config with usersync and userIds with empty names or that dont match a submodule.name', function () {
      setSubmoduleRegistry([pubCommonIdSubmodule, unifiedIdSubmodule]);
      init(config);
      config.setConfig({
        usersync: {
          userIds: [{
            name: '',
            value: { test: '1' }
          }, {
            name: 'foo',
            value: { test: '1' }
          }]
        }
      });
      expect(typeof utils.logInfo.args[0]).to.equal('undefined');
    });

    it('config with 1 configurations should create 1 submodules', function () {
      setSubmoduleRegistry([pubCommonIdSubmodule, unifiedIdSubmodule]);
      init(config);
      config.setConfig(getConfigMock(['unifiedId', 'unifiedid', 'cookie']));

      expect(utils.logInfo.args[0][0]).to.exist.and.to.equal('User ID - usersync config updated for 1 submodules');
    });

    it('config with 2 configurations should result in 2 submodules add', function () {
      setSubmoduleRegistry([pubCommonIdSubmodule, unifiedIdSubmodule]);
      init(config);
      config.setConfig({
        usersync: {
          syncDelay: 0,
          userIds: [{
            name: 'pubCommonId', value: {'pubcid': '11111'}
          }, {
            name: 'unifiedId',
            storage: { name: 'unifiedid', type: 'cookie' }
          }]
        }
      });
      expect(utils.logInfo.args[0][0]).to.exist.and.to.equal('User ID - usersync config updated for 2 submodules');
    });

    it('config syncDelay updates module correctly', function () {
      setSubmoduleRegistry([pubCommonIdSubmodule, unifiedIdSubmodule]);
      init(config);
      config.setConfig({
        usersync: {
          syncDelay: 99,
          userIds: [{
            name: 'unifiedId',
            storage: { name: 'unifiedid', type: 'cookie' }
          }]
        }
      });
      expect(syncDelay).to.equal(99);
    });
  });

  describe('Request bids hook appends userId to bid objs in adapters', function() {
    let adUnits;

    beforeEach(function() {
      adUnits = [getAdUnitMock()];
    });

    it('test hook from pubcommonid cookie', function(done) {
      utils.setCookie('pubcid', 'testpubcid', (new Date(Date.now() + 100000).toUTCString()));

      setSubmoduleRegistry([pubCommonIdSubmodule]);
      init(config);
      config.setConfig(getConfigMock(['pubCommonId', 'pubcid', 'cookie']));

      requestBidsHook(function() {
        adUnits.forEach(unit => {
          unit.bids.forEach(bid => {
            expect(bid).to.have.deep.nested.property('userId.pubcid');
            expect(bid.userId.pubcid).to.equal('testpubcid');
          });
        });
        utils.setCookie('pubcid', '', EXPIRED_COOKIE_DATE);
        done();
      }, {adUnits});
    });

    it('test hook from pubcommonid config value object', function(done) {
      setSubmoduleRegistry([pubCommonIdSubmodule]);
      init(config);
      config.setConfig({
        usersync: {
          syncDelay: 0,
          userIds: [{
            name: 'pubCommonId',
            value: {'pubcidvalue': 'testpubcidvalue'}
          }]}
      });

      requestBidsHook(function() {
        adUnits.forEach(unit => {
          unit.bids.forEach(bid => {
            expect(bid).to.have.deep.nested.property('userId.pubcidvalue');
            expect(bid.userId.pubcidvalue).to.equal('testpubcidvalue');
          });
        });
        done();
      }, {adUnits});
    });

    it('test hook from pubcommonid html5', function(done) {
      // simulate existing browser local storage values
      localStorage.setItem('unifiedid_alt', JSON.stringify({'TDID': 'testunifiedid_alt'}));
      localStorage.setItem('unifiedid_alt_exp', '');

      setSubmoduleRegistry([unifiedIdSubmodule]);
      init(config);
      config.setConfig(getConfigMock(['unifiedId', 'unifiedid_alt', 'html5']));

      requestBidsHook(function() {
        adUnits.forEach(unit => {
          unit.bids.forEach(bid => {
            expect(bid).to.have.deep.nested.property('userId.tdid');
            expect(bid.userId.tdid).to.equal('testunifiedid_alt');
          });
        });
        localStorage.removeItem('unifiedid_alt');
        localStorage.removeItem('unifiedid_alt_exp');
        done();
      }, {adUnits});
    });

    it('test hook from idLink html5', function(done) {
      // simulate existing browser local storage values
      localStorage.setItem('idl_env', 'AiGNC8Z5ONyZKSpIPf');
      localStorage.setItem('idl_env_exp', '');

      setSubmoduleRegistry([idLinkSubmodule]);
      init(config);
      config.setConfig(getConfigMock(['idLink', 'idl_env', 'html5']));
      requestBidsHook(function() {
        adUnits.forEach(unit => {
          unit.bids.forEach(bid => {
            expect(bid).to.have.deep.nested.property('userId.idl_env');
            expect(bid.userId.idl_env).to.equal('AiGNC8Z5ONyZKSpIPf');
          });
        });
        localStorage.removeItem('idl_env');
        localStorage.removeItem('idl_env_exp');
        done();
      }, {adUnits});
    });

    it('test hook from idLink cookie', function(done) {
      utils.setCookie('idl_env', 'AiGNC8Z5ONyZKSpIPf', (new Date(Date.now() + 100000).toUTCString()));

      setSubmoduleRegistry([idLinkSubmodule]);
      init(config);
      config.setConfig(getConfigMock(['idLink', 'idl_env', 'cookie']));

      requestBidsHook(function() {
        adUnits.forEach(unit => {
          unit.bids.forEach(bid => {
            expect(bid).to.have.deep.nested.property('userId.idl_env');
            expect(bid.userId.idl_env).to.equal('AiGNC8Z5ONyZKSpIPf');
          });
        });
        utils.setCookie('idl_env', '', EXPIRED_COOKIE_DATE);
        done();
      }, {adUnits});
    });

    it('test hook when both pubCommonId and unifiedId have data to pass', function(done) {
      utils.setCookie('pubcid', 'testpubcid', (new Date(Date.now() + 5000).toUTCString()));
      utils.setCookie('unifiedid', JSON.stringify({'TDID': 'testunifiedid'}), (new Date(Date.now() + 5000).toUTCString()));

      setSubmoduleRegistry([pubCommonIdSubmodule, unifiedIdSubmodule]);
      init(config);
      config.setConfig(getConfigMock(['pubCommonId', 'pubcid', 'cookie'], ['unifiedId', 'unifiedid', 'cookie']));

      requestBidsHook(function() {
        adUnits.forEach(unit => {
          unit.bids.forEach(bid => {
            // verify that the PubCommonId id data was copied to bid
            expect(bid).to.have.deep.nested.property('userId.pubcid');
            expect(bid.userId.pubcid).to.equal('testpubcid');
            // also check that UnifiedId id data was copied to bid
            expect(bid).to.have.deep.nested.property('userId.tdid');
            expect(bid.userId.tdid).to.equal('testunifiedid');
          });
        });
        utils.setCookie('pubcid', '', EXPIRED_COOKIE_DATE);
        utils.setCookie('unifiedid', '', EXPIRED_COOKIE_DATE);
        done();
      }, {adUnits});
    });

    it('IdLink test hook when pubCommonId, unifiedId and IdLink have data to pass', function(done) {
      utils.setCookie('pubcid', 'testpubcid', (new Date(Date.now() + 5000).toUTCString()));
      utils.setCookie('unifiedid', JSON.stringify({'TDID': 'testunifiedid'}), (new Date(Date.now() + 5000).toUTCString()));
      utils.setCookie('idl_env', 'AiGNC8Z5ONyZKSpIPf', (new Date(Date.now() + 5000).toUTCString()));

      setSubmoduleRegistry([pubCommonIdSubmodule, unifiedIdSubmodule, idLinkSubmodule]);
      init(config);
      config.setConfig(getConfigMock(['pubCommonId', 'pubcid', 'cookie'], ['unifiedId', 'unifiedid', 'cookie'], ['idLink', 'idl_env', 'cookie']));
      requestBidsHook(function() {
        adUnits.forEach(unit => {
          unit.bids.forEach(bid => {
            // verify that the PubCommonId id data was copied to bid
            expect(bid).to.have.deep.nested.property('userId.pubcid');
            expect(bid.userId.pubcid).to.equal('testpubcid');
            // also check that UnifiedId id data was copied to bid
            expect(bid).to.have.deep.nested.property('userId.tdid');
            expect(bid.userId.tdid).to.equal('testunifiedid');
            // check that idLink id data was copied to bid
            expect(bid).to.have.deep.nested.property('userId.idl_env');
            expect(bid.userId.idl_env).to.equal('AiGNC8Z5ONyZKSpIPf');
          });
        });
        utils.setCookie('pubcid', '', EXPIRED_COOKIE_DATE);
        utils.setCookie('unifiedid', '', EXPIRED_COOKIE_DATE);
        utils.setCookie('idl_env', '', EXPIRED_COOKIE_DATE);
        done();
      }, {adUnits});
    });

    it('test hook when pubCommonId and unifiedId have their modules added before and after init', function(done) {
      utils.setCookie('pubcid', 'testpubcid', (new Date(Date.now() + 5000).toUTCString()));
      utils.setCookie('unifiedid', JSON.stringify({'TDID': 'cookie-value-add-module-variations'}), new Date(Date.now() + 5000).toUTCString());

      setSubmoduleRegistry([]);

      // attaching before init
      attachIdSystem(pubCommonIdSubmodule);

      init(config);

      // attaching after init
      attachIdSystem(unifiedIdSubmodule);

      config.setConfig(getConfigMock(['pubCommonId', 'pubcid', 'cookie'], ['unifiedId', 'unifiedid', 'cookie']));

      requestBidsHook(function() {
        adUnits.forEach(unit => {
          unit.bids.forEach(bid => {
            // verify that the PubCommonId id data was copied to bid
            expect(bid).to.have.deep.nested.property('userId.pubcid');
            expect(bid.userId.pubcid).to.equal('testpubcid');
            // also check that UnifiedId id data was copied to bid
            expect(bid).to.have.deep.nested.property('userId.tdid');
            expect(bid.userId.tdid).to.equal('cookie-value-add-module-variations');
          });
        });
        utils.setCookie('pubcid', '', EXPIRED_COOKIE_DATE);
        utils.setCookie('unifiedid', '', EXPIRED_COOKIE_DATE);
        done();
      }, {adUnits});
    });

    it('test hook when pubCommonId and IdLink have their modules added before and after init', function(done) {
      utils.setCookie('pubcid', 'testpubcid', (new Date(Date.now() + 5000).toUTCString()));
      utils.setCookie('idl_env', 'AiGNC8Z5ONyZKSpIPf', new Date(Date.now() + 5000).toUTCString());

      setSubmoduleRegistry([]);

      // attaching before init
      attachIdSystem(pubCommonIdSubmodule);

      init(config);

      // attaching after init
      attachIdSystem(idLinkSubmodule);

      config.setConfig(getConfigMock(['pubCommonId', 'pubcid', 'cookie'], ['idLink', 'idl_env', 'cookie']));

      requestBidsHook(function() {
        adUnits.forEach(unit => {
          unit.bids.forEach(bid => {
            // verify that the PubCommonId id data was copied to bid
            expect(bid).to.have.deep.nested.property('userId.pubcid');
            expect(bid.userId.pubcid).to.equal('testpubcid');
            // also check that idLink id data was copied to bid
            expect(bid).to.have.deep.nested.property('userId.idl_env');
            expect(bid.userId.idl_env).to.equal('AiGNC8Z5ONyZKSpIPf');
          });
        });
        utils.setCookie('pubcid', '', EXPIRED_COOKIE_DATE);
        utils.setCookie('idl_env', '', EXPIRED_COOKIE_DATE);
        done();
      }, {adUnits});
    });

    it('should add new id system ', function(done) {
      utils.setCookie('pubcid', 'testpubcid', (new Date(Date.now() + 5000).toUTCString()));
      utils.setCookie('unifiedid', JSON.stringify({'TDID': 'cookie-value-add-module-variations'}), new Date(Date.now() + 5000).toUTCString());
      utils.setCookie('idl_env', 'AiGNC8Z5ONyZKSpIPf', new Date(Date.now() + 5000).toUTCString());
      utils.setCookie('MOCKID', JSON.stringify({'MOCKID': '123456778'}), new Date(Date.now() + 5000).toUTCString());

      setSubmoduleRegistry([pubCommonIdSubmodule, unifiedIdSubmodule, idLinkSubmodule]);
      init(config);

      config.setConfig({
        usersync: {
          syncDelay: 0,
          userIds: [{
            name: 'pubCommonId', storage: { name: 'pubcid', type: 'cookie' }
          }, {
            name: 'unifiedId', storage: { name: 'unifiedid', type: 'cookie' }
          }, {
            name: 'idLink', storage: { name: 'idl_env', type: 'cookie' }
          }, {
            name: 'mockId', storage: { name: 'MOCKID', type: 'cookie' }
          }]
        }
      });

      // Add new submodule named 'mockId'
      attachIdSystem({
        name: 'mockId',
        decode: function(value) {
          return {
            'mid': value['MOCKID']
          };
        },
        getId: function() {
          return {'MOCKID': '1234'}
        }
      });

      requestBidsHook(function() {
        adUnits.forEach(unit => {
          unit.bids.forEach(bid => {
            // check PubCommonId id data was copied to bid
            expect(bid).to.have.deep.nested.property('userId.pubcid');
            expect(bid.userId.pubcid).to.equal('testpubcid');
            // check UnifiedId id data was copied to bid
            expect(bid).to.have.deep.nested.property('userId.tdid');
            expect(bid.userId.tdid).to.equal('cookie-value-add-module-variations');
            // also check that idLink id data was copied to bid
            expect(bid).to.have.deep.nested.property('userId.idl_env');
            expect(bid.userId.idl_env).to.equal('AiGNC8Z5ONyZKSpIPf');
            // check MockId data was copied to bid
            expect(bid).to.have.deep.nested.property('userId.mid');
            expect(bid.userId.mid).to.equal('123456778');
          });
        });
        utils.setCookie('pubcid', '', EXPIRED_COOKIE_DATE);
        utils.setCookie('unifiedid', '', EXPIRED_COOKIE_DATE);
        utils.setCookie('idl_env', '', EXPIRED_COOKIE_DATE);
        utils.setCookie('MOCKID', '', EXPIRED_COOKIE_DATE);
        done();
      }, {adUnits});
    });
  })
});
