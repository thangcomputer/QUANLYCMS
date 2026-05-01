const Notification = require('../models/Notification');

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
      const newNotification = await Notification.create({
        type,
        title,
        content,
        sender_id,
        receivers: receiversArr,
        payload,
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
          link,
          read: false
        };

        if (receiversArr.includes('GLOBAL')) {
          io.emit('RECEIVE_NOTIFICATION', socketData);
          io.emit('data:refresh', { type: 'global' });
        } else {
          receiversArr.forEach(receiver => {
            // Emit to specific user room OR role room (e.g., 'ALL_ADMIN')
            io.to(receiver).emit('RECEIVE_NOTIFICATION', { ...socketData, userId: receiver });
            
            // Also trigger a background sync for anyone in that room
            io.to(receiver).emit('data:refresh', { type: 'notification', receiver });
          });
        }
        
        // Always emit 'new-notification' as a legacy trigger for some clients
        io.emit('new-notification');
      }

      return newNotification;
    } catch (error) {
      console.error('[NotificationService] Send error:', error);
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
}

module.exports = NotificationService;
