const User = require('./User');
const Subscription = require('./Subscription');
const VPNServer = require('./VPNServer');
const VPNConnection = require('./VPNConnection');

User.hasOne(Subscription, { foreignKey: 'userId' });
Subscription.belongsTo(User, { foreignKey: 'userId' });

User.hasMany(VPNConnection, { foreignKey: 'userId' });
VPNConnection.belongsTo(User, { foreignKey: 'userId' });

VPNServer.hasMany(VPNConnection, { foreignKey: 'serverId' });
VPNConnection.belongsTo(VPNServer, { foreignKey: 'serverId' });

module.exports = {
  User,
  Subscription,
  VPNServer,
  VPNConnection
};