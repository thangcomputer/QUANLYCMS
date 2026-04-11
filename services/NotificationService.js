const Notification = require('../models/Notification');

class NotificationService {
  /**
   * Centralized Notification Sender
   * @param {Object} io - Socket.io instance
   * @param {Object} options - Notification details
   * @param {String} options.type - 'SYSTEM', 'COURSE', 'MESSAGE', 'EXAM', etc.
   * @param {String} options.title
   * @param {String} options.content
   * @param {String} [options.sender_id] - User ID or 'SYSTEM'
   * @param {Array<String>|String} options.receivers - e.g., ['id1', 'id2'], 'GLOBAL', 'ALL_ADMIN', 'ALL_TEACHER', 'ALL_TEACHER_CS1'
   * @param {Object} [options.payload] - Additional data (e.g. courseId, messageId)
   */
  static async send(io, { type, title, content, sender_id = 'SYSTEM', receivers, payload = {} }) {
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
        if (receiversArr.includes('GLOBAL')) {
          io.emit('RECEIVE_NOTIFICATION', newNotification);
        } else {
          // Emit to specific users or roles using rooms.
          // Role strings (e.g., ALL_ADMIN) can be emitted directly as rooms.
          // Specific IDs can also be used as rooms if each connected user joins a room with their ID.
          receiversArr.forEach(receiver => {
            io.to(receiver).emit('RECEIVE_NOTIFICATION', newNotification);
          });
        }
      }

      return newNotification;
    } catch (error) {
      console.error('[NotificationService] Send error:', error);
      throw error;
    }
  }
}

module.exports = NotificationService;
