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


const https = require('https');

exports.newUser = functions
  .region('asia-northeast1')
  .auth.user().onCreate(_ => {
    return https.get("https://api.telegram.org/bot762520235:AAEVu2VTl1tNjEG1ANAHkDR2k9xjQ7Ruf5k/sendMessage?chat_id=276487288&text=New%user")
  })


const mkdirp = require('mkdirp-promise');
const spawn = require('child-process-promise').spawn;
const path = require('path');
const os = require('os');
const fs = require('fs');

// Max height and width of the thumbnail in pixels.
const THUMB_MAX_HEIGHT = 800;
const THUMB_MAX_WIDTH = 400;
// Thumbnail prefix added to file names.
const THUMB_PREFIX = 'thumb_';

/**
 * When an image is uploaded in the Storage bucket We generate a thumbnail automatically using
 * ImageMagick.
 * After the thumbnail has been generated and uploaded to Cloud Storage,
 * we write the public URL to the Firebase Realtime Database.
 */
exports.generateThumbnail = functions
  .region('asia-northeast1').storage.object().onFinalize(async (object) => {
  // File and directory paths.
  const filePath = object.name;
  const contentType = object.contentType; // This is the image MIME type
  const fileDir = path.dirname(filePath);
  const fileName = path.basename(filePath);
  const thumbFilePath = path.normalize(path.join(fileDir, `${THUMB_PREFIX}${fileName}`));
  const tempLocalFile = path.join(os.tmpdir(), filePath);
  const tempLocalDir = path.dirname(tempLocalFile);
  const tempLocalThumbFile = path.join(os.tmpdir(), thumbFilePath);

  // Exit if this is triggered on a file that is not an image.
  if (!contentType.startsWith('image/')) {
    return console.log('This is not an image.');
  }

  // Exit if the image is already a thumbnail.
  if (fileName.startsWith(THUMB_PREFIX)) {
    return console.log('Already a Thumbnail.');
  }

  // Cloud Storage files.
  const bucket = admin.storage().bucket(object.bucket);
  const file = bucket.file(filePath);
  const thumbFile = bucket.file(thumbFilePath);
  const metadata = {
    contentType: contentType,
    // To enable Client-side caching you can set the Cache-Control headers here. Uncomment below.
    // 'Cache-Control': 'public,max-age=3600',
  };

  // Create the temp directory where the storage file will be downloaded.
  await mkdirp(tempLocalDir)
  // Download file from bucket.
  await file.download({destination: tempLocalFile});
  console.log('The file has been downloaded to', tempLocalFile);
  // Generate a thumbnail using ImageMagick.
  await spawn('convert', [tempLocalFile, '-thumbnail', `${THUMB_MAX_WIDTH}x${THUMB_MAX_HEIGHT}>`, tempLocalThumbFile], {capture: ['stdout', 'stderr']});
  console.log('Thumbnail created at', tempLocalThumbFile);
  // Uploading the Thumbnail.
  await bucket.upload(tempLocalThumbFile, {destination: thumbFilePath, metadata: metadata});
  console.log('Thumbnail uploaded to Storage at', thumbFilePath);
  // Once the image has been uploaded delete the local files to free up disk space.
  fs.unlinkSync(tempLocalFile);
  fs.unlinkSync(tempLocalThumbFile);
  return console.log('Thumbnail URLs saved to storage.');
});
