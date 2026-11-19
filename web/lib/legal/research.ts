// Research and accuracy studies.
export const RESEARCH = `
Accuracy Studies measure how often the live scan wrongly accepts an attack and how often it wrongly stops a real person, with confidence ranges and a breakdown by skin tone, lighting, device and capture mode. This document sets the rules for people who take part and for how results are published. The printable information and consent sheet (English and French) in the product states the same points for participants.

### 1. Who may take part, and how

- Adults (18 or older) who agree freely. Taking part has no effect on any account or service, and payment or reimbursement never depends on the result.
- The study team gives each person the information and consent sheet and records that consent was confirmed **before** any capture. The product will not add a participant without that confirmation.
- Attack materials (photos, screens, masks, virtual-camera video) may only be made from the face of a person who has consented to be part of the study.

### 2. What is recorded

| Recorded | Not recorded |
| --- | --- |
| A code for the person; approximate age range; gender; skin tone on the Monk scale; country | Name, phone number, email address |
| The capture frames and, for the study, the result of each run, the lighting and the phone model | Anything linking the code back to a named person (the study team keeps any such link separately and outside AfriVerify) |

### 3. Handling, retention and withdrawal

3.1 Frames are encrypted with AES-256-GCM before storage and are deleted automatically when the study's retention period ends (default 180 days). The measurements themselves, which cannot identify anyone, may be kept.

3.2 A participant may withdraw at any time. On withdrawal the product deletes their images and their results and removes them from later reports.

3.3 Study images are used only to measure the Services. They are not used to train models, are not shared with other customers, and are not shown outside the study team.

3.4 CSV exports contain no personal details and must be protected like the study itself.

### 4. Publishing results

4.1 Results are published only as totals, rates and ranges, never as individuals.

4.2 AfriVerify marks a report as a draft until the study has enough data (at least 100 genuine captures and 30 attacks of each type, with minimum numbers per skin-tone group, lighting condition and device), and does not quote a draft as a result.

4.3 Every published report states its methods, sample, period, devices, limits and, plainly, that it is a vendor's own study and not an independent or accredited test. AfriVerify will not claim certification (for example iBeta, ISO/IEC 30107-3 conformance or any NIST result) unless an accredited body has issued it.

4.4 If a study shows that a group of people is stopped notably more often, AfriVerify will report it and investigate before relying on the result.

### 5. Customers' own studies

A Customer that runs a study with its own participants is the controller for that data and must use a consent at least as clear as the sheet in the product, obtain any ethics or regulatory approval its country requires, and keep to these rules.
`;
