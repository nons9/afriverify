// Biometric and liveness data notice and consent.
export const BIOMETRIC = `
This notice has two uses. Section 1 is the wording a Customer shows a person **before** the live face scan, and which the person accepts. Sections 2 to 5 explain the practices behind it and bind AfriVerify.

### 1. Wording to show before the scan

> **Before we check that you are a real person**
>
> **[Customer name]** is using AfriVerify to confirm your identity. To do that, your phone or computer camera will record a short video of your face, a few seconds long, while you follow simple instructions such as turning your head or blinking.
>
> During the scan the screen shows changing colours. This is how we check that a real face is in front of the camera. If flashing colours bother you, tap **Stop** at any time or choose to skip the colour step.
>
> We compare the video with the photo on your ID document. The video and photos are encrypted. AfriVerify keeps extra video frames for 30 days and deletes them automatically; we keep the verification result, your ID photo and your best selfie for 12 months, and the record of the result for the period in our privacy notice. We do not sell your images and do not use them to train our systems.
>
> You can say no. If you do, [Customer name] will [offer another way to verify]. You can withdraw later by contacting [Customer contact] or privacy@sankofaapp.com.
>
> ☐ **I agree to a live face scan for this verification.**  [Read the full notice]

The checkbox must be ticked by the person, not pre-ticked. (The reduced-motion option in the product is the one exception: it pre-ticks the choice to *skip the colour step only*, and explains it.) The API refuses to start a live scan unless consent is sent as true.

### 2. What is captured and why

| What | Why | Where it goes |
| --- | --- | --- |
| A short sequence of camera frames and, where enabled, a short capture video | To confirm a real, live person did the instructions | Analysed on AfriVerify's servers; stored encrypted |
| The name of the camera device the browser reports | To detect software cameras that can play any video | Used for the Outcome and stored with it |
| The timing of the frames and of the on-screen colours | To check the face reflects the colours shown | Used for the Outcome |
| A face-match score against the ID photo | To confirm the live person matches the document | The score is stored; AfriVerify's own engine does not keep or return a face template |
| A copy of the best frame and the ID photo | For review, disputes and the Customer's records | Encrypted storage for the retention period |

### 3. How it is handled

3.1 AfriVerify analyses every frame itself and never relies on the browser's claim about what it saw.

3.2 Images and video are encrypted with AES-256-GCM before storage and are visible only to staff who need them for support, security or legal reasons, and to the Customer through the dashboard where its flow stores them.

3.3 In borderline cases the image may be sent to an identity provider (Smile Identity, Dojah or Onfido) for a second opinion. The provider processes it for that check under its terms with AfriVerify.

3.4 AfriVerify does not sell biometric data, does not use it for advertising, does not use it to train or improve models without separate, specific, written consent from the person, and does not build a searchable face database across customers.

3.5 Retention follows the Data Processing Agreement, clause 11. Extra frames and capture video are deleted after 30 days by default.

### 4. Your choices

- **Decline.** You may decline. The Customer must then offer another route where the law requires it, or tell you the consequence.
- **Stop or skip colours.** You may stop the scan at any moment and skip the colour step. A scan without the colour check cannot be approved automatically, so it goes to human review.
- **Withdraw and delete.** You may ask the Customer or AfriVerify (privacy@sankofaapp.com) to delete your images. Deletion is subject to any legal duty to keep records, which we will explain.
- **Complain.** You may complain to us, to the Customer, and to your data protection authority.

### 5. Customer duties

The Customer must show section 1 (or a notice at least as clear) before every live scan, record that the person agreed, offer an alternative where required, keep to the purposes stated, and pass withdrawal requests to AfriVerify within 5 business days.
`;
