const notificationRepository = require('../repositories');
const logger = require('../../../config/logger');

class NotificationService {
  /**
   * Centralized Notification Sender
   * @param {Object} io - Socket.io instance
   * @param {Object} options - Notification details
   * @param {String} options.type - 'SYSTEM', 'COURSE', 'FINANCE', 'EVALUATION', 'MESSAGE', 'EXAM', etc.
   * @param {String} options.title
   * @param {String} options.content
   * @param {String} [options.sender_id] - User ID or 'SYSTEM'
   * @param {Array<String>|String} options.receivers - e.g., ['id1', 'id2'], 'GLOBAL', 'ALL_ADMIN', 'ALL_TEACHER'
   * @param {Object} [options.payload] - Additional data (e.g. courseId, messageId)
   * @param {String} [options.link] - Deep link for the notification
   */
  static async send(io, { type, title, content, sender_id = 'SYSTEM', receivers, payload = {}, link = '' }) {
    try {
      // Normalize receivers to array
      let receiversArr = Array.isArray(receivers) ? receivers : [receivers];

      // Save to database
      const newNotification = await notificationRepository.create({
        type,
        title,
        content,
        sender_id,
        receivers: receiversArr,
        payload,
        path: link, // Save link as path
      });

      // Fire Socket.io event based on receivers
      if (io) {
        // Construct the client-side data object
        const socketData = {
          _id: newNotification._id,
          type: type.toLowerCase(),
          title,
          message: content,
          time: new Date(),
          payload,
          path: link, // Send as path for frontend navigate(n.path)
          read: false
        };

        if (receiversArr.includes('GLOBAL')) {
          io.to('ALL_ADMIN').emit('RECEIVE_NOTIFICATION', socketData);
          io.to('ALL_STAFF').emit('RECEIVE_NOTIFICATION', socketData);
          io.to('ALL_SUPPORT').emit('RECEIVE_NOTIFICATION', socketData);
          io.to('ALL_TEACHER').emit('RECEIVE_NOTIFICATION', socketData);
          io.to('ALL_STUDENT').emit('RECEIVE_NOTIFICATION', socketData);
          io.to('ALL_ADMIN').emit('data:refresh', { type: 'global' });
          io.to('ALL_ADMIN').emit('new-notification');
          io.to('ALL_STAFF').emit('new-notification');
          io.to('ALL_SUPPORT').emit('new-notification');
          io.to('ALL_TEACHER').emit('new-notification');
          io.to('ALL_STUDENT').emit('new-notification');
        } else {
          receiversArr.forEach((receiver) => {
            if (!receiver) return;
            const isBroadcastRoom = /^(ALL_|GLOBAL$|ALL$)/.test(String(receiver));
            io.to(receiver).emit(
              'RECEIVE_NOTIFICATION',
              isBroadcastRoom ? socketData : { ...socketData, userId: receiver },
            );
            io.to(receiver).emit('data:refresh', { type: 'notification', receiver });
            io.to(String(receiver)).emit('new-notification');
          });
          if (receiversArr.some((r) => String(r || '').startsWith('ALL_ADMIN_'))) {
            io.to('ALL_SUPER_ADMIN').emit('new-notification');
          }
        }
      }

      return newNotification;
    } catch (error) {
      logger.error('[NotificationService] Send error:', error);
      throw error;
    }
  }

  /**
   * Helper to notify all admins
   */
  static async notifyAdmins(io, title, content, payload = {}, link = '') {
    return this.send(io, {
      type: 'SYSTEM',
      title,
      content,
      receivers: 'ALL_ADMIN',
      payload,
      link
    });
  }

  /**
   * Helper to notify branch staff + super admins only
   */
  static async notifyBranchAdmins(io, { branchId, title, content, payload = {}, link = '' }) {
    const receivers = ['ALL_SUPER_ADMIN'];
    if (branchId) {
      receivers.push(`ALL_ADMIN_${branchId}`);
    } else {
      receivers.push('ALL_ADMIN');
    }
    return this.send(io, {
      type: 'SYSTEM',
      title,
      content,
      receivers,
      payload,
      link
    });
  }
}

module.exports = NotificationService;
