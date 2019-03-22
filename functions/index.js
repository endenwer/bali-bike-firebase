const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

const firestore = admin.firestore();

exports.sendChatNotification = functions
  .region('asia-northeast1')
  .firestore
  .document('chats/{chatId}/messages/{messageId}').onCreate(
    async (snap, context) => {
      const message = snap.data();
      const senderId = message.senderUid;
      const receiverId = context.params.chatId.replace(senderId, '');

      console.log('New message from:', senderId, 'for user:', receiverId);

      // Get the device notification token.
      const getDeviceTokenPromise = firestore.doc(`users/${receiverId}`).get();

      // Get the sender profile.
      const getSenderProfilePromise = admin.auth().getUser(senderId);

      // The snapshot to the user's token.
      let tokenSnapshot;

      // User's token.
      let token;

      const results = await Promise.all([getDeviceTokenPromise, getSenderProfilePromise]);
      tokenSnapshot = results[0];
      const sender = results[1];

      // Check if there are any device tokens.
      if (!tokenSnapshot.exists) {
        return console.log('There is no notification token to send to.');
      }
      console.log('Fetched sender profile', sender);

      // Notification details.
      const payload = {
        data: {chatId: context.params.chatId, type: 'NEW_MESSAGE'},
        notification: {
          title: sender.displayName,
          body: message.text,
          icon: sender.photoURL
        }
      };

      // Listing all tokens as an array.
      token = tokenSnapshot.get('pushToken');
      // Send notifications to all tokens.
      const response = await admin.messaging().sendToDevice(token, payload);
      response.results.forEach((result, index) => {
        const error = result.error;
        if (error) {
          console.error('Failure sending notification to', token, error);
        } else {
          console.log('Notification sended.');
        }
      });

      return response.successCount > 0;
    });
