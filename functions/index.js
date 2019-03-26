const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp();

const firestore = admin.firestore();
firestore.settings({timestampsInSnapshots: true});

exports.sendChatNotification = functions
  .region('asia-northeast1')
  .firestore
  .document('chats/{chatId}/messages/{messageId}').onCreate(
    async (snap, context) => {
      const message = snap.data();
      const senderId = message.senderUid;
      const receiverId = context.params.chatId.replace(senderId, '');

      console.log('New message from:', senderId, 'for user:', receiverId);

      // Get the list of device notification tokens.
      const getDeviceTokensPromise = firestore.doc(`users/${receiverId}`).get();

      // Get the sender profile.
      const getSenderProfilePromise = admin.auth().getUser(senderId);

      // The snapshot to the user's tokens.
      let tokensSnapshot;

      // The array containing all the user's tokens.
      let tokens;

      const results = await Promise.all([getDeviceTokensPromise, getSenderProfilePromise]);
      tokensSnapshot = results[0];
      const sender = results[1];

      tokens = tokensSnapshot.get('pushTokens');
      // Check if there are any device tokens.
      if (!tokensSnapshot.exists || !tokens.length) {
        return console.log('There are no notification tokens to send to.');
      }

      // Notification details.
      const payload = {
        data: {chatId: context.params.chatId, type: 'NEW_MESSAGE'},
        notification: {
          sound: "default",
          title: sender.displayName,
          body: message.text,
          icon: sender.photoURL
        }
      };

      // Send notifications to all tokens.
      const response = await admin.messaging().sendToDevice(tokens, payload);
      // For each message check if there was an error.
      const tokensToRemove = [];
      response.results.forEach((result, index) => {
        const error = result.error;
        if (error) {
          console.error('Failure sending notification to', tokens[index], error);
          // Cleanup the tokens who are not registered anymore.
          if (error.code === 'messaging/invalid-registration-token' ||
              error.code === 'messaging/registration-token-not-registered') {
            tokensToRemove.push(tokensSnapshot.ref.update(firestore.FieldValue.arrayRemove(tokens[index])));
          }
        } else {
          console.log('Notification sended.');
        }
      });

      return Promise.all(tokensToRemove);
    });
