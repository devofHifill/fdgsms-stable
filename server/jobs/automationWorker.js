import Enrollment from "../models/Enrollment.js";
import Campaign from "../models/Campaign.js";
import Contact from "../models/Contact.js";
import { sendSMS } from "../services/twilioService.js";
import SMSMessage from "../models/SMSMessage.js";
import { createSystemLog } from "../services/systemLogService.js";

export async function runAutomationCycle() {
  const now = new Date();

  try {
    const enrollments = await Enrollment.find({
      status: "active",
      nextSendAt: { $lte: now },
    }).limit(10);

    for (const enrollment of enrollments) {
      try {
        const campaign = await Campaign.findById(enrollment.campaignId);
        const contact = await Contact.findById(enrollment.contactId);

        if (!campaign || !contact) {
          enrollment.failureCount = (enrollment.failureCount || 0) + 1;
          enrollment.lastError = !campaign
            ? "Campaign not found"
            : "Contact not found";

          if (enrollment.failureCount >= 3) {
            enrollment.status = "stopped";
            enrollment.stopReason = "failure_threshold";
          }

          await enrollment.save();

          await createSystemLog({
            level: "error",
            category: "automation",
            event: "automation_dependency_missing",
            message: !campaign
              ? "Automation enrollment skipped because campaign was not found"
              : "Automation enrollment skipped because contact was not found",
            contactId: contact?._id || enrollment.contactId || null,
            enrollmentId: enrollment._id,
            campaignId: campaign?._id || enrollment.campaignId || null,
            metadata: {
              failureCount: enrollment.failureCount || 0,
              currentStep: enrollment.currentStep,
            },
          });

          continue;
        }

        const step = campaign.steps.find(
          (s) => Number(s.stepNumber) === Number(enrollment.currentStep)
        );

        if (!step) {
          enrollment.status = "completed";
          enrollment.stopReason = "sequence_finished";
          enrollment.nextSendAt = null;
          enrollment.completedAt = new Date();
          enrollment.lastError = "";
          await enrollment.save();

          await createSystemLog({
            level: "info",
            category: "automation",
            event: "enrollment_completed",
            message:
              "Enrollment completed because no further campaign step was found",
            contactId: contact._id,
            enrollmentId: enrollment._id,
            campaignId: campaign._id,
            metadata: {
              currentStep: enrollment.currentStep,
            },
          });

          continue;
        }

        const response = await sendSMS({
          to: contact.normalizedPhone,
          body: step.body,
        });

        await SMSMessage.create({
          contactId: contact._id,
          phone: contact.phone,
          normalizedPhone: contact.normalizedPhone,
          direction: "outbound",
          body: step.body,
          provider: "twilio",
          providerMessageSid: response.sid || "",
          status: response.status || "queued",

          enrollmentId: enrollment._id,
          campaignId: campaign._id,
          stepNumber: step.stepNumber,
          messageType: "automation",

          metadata: {
            campaignName: campaign.name,
            delayHours: step.delayHours,
          },
        });

        await createSystemLog({
          level: "info",
          category: "automation",
          event: "automation_step_sent",
          message: "Automation step sent successfully",
          contactId: contact._id,
          enrollmentId: enrollment._id,
          campaignId: campaign._id,
          metadata: {
            stepNumber: step.stepNumber,
            providerMessageSid: response.sid || "",
            status: response.status || "",
          },
        });

        enrollment.lastSentAt = new Date();
        enrollment.failureCount = 0;
        enrollment.lastError = "";

        const nextStepNumber = enrollment.currentStep + 1;
        const nextStep = campaign.steps.find(
          (s) => Number(s.stepNumber) === Number(nextStepNumber)
        );

        if (nextStep) {
          enrollment.currentStep = nextStepNumber;
          enrollment.nextSendAt = new Date(
            Date.now() + Number(step.delayHours || 0) * 60 * 60 * 1000
          );
          enrollment.status = "active";
          enrollment.stopReason = "";
        } else {
          enrollment.currentStep = step.stepNumber;
          enrollment.status = "completed";
          enrollment.stopReason = "sequence_finished";
          enrollment.nextSendAt = null;
          enrollment.completedAt = new Date();

          await createSystemLog({
            level: "info",
            category: "automation",
            event: "enrollment_completed",
            message: "Enrollment completed after final campaign step",
            contactId: contact._id,
            enrollmentId: enrollment._id,
            campaignId: campaign._id,
            metadata: {
              finalStepNumber: step.stepNumber,
            },
          });
        }

        await enrollment.save();
      } catch (err) {
        console.error("Automation error:", err);

        enrollment.failureCount = (enrollment.failureCount || 0) + 1;
        enrollment.lastError = err.message || "Automation step failed";

        if (enrollment.failureCount >= 3) {
          enrollment.status = "stopped";
          enrollment.stopReason = "failure_threshold";
          enrollment.nextSendAt = null;
        }

        await enrollment.save();

        await createSystemLog({
          level: "error",
          category: "automation",
          event: "automation_step_failed",
          message: err.message || "Automation step failed",
          contactId: enrollment.contactId || null,
          enrollmentId: enrollment._id,
          campaignId: enrollment.campaignId || null,
          metadata: {
            currentStep: enrollment.currentStep,
            failureCount: enrollment.failureCount || 0,
            stopped: enrollment.status === "stopped",
          },
        });
      }
    }
  } catch (error) {
    console.error("Automation cycle fatal error:", error);

    await createSystemLog({
      level: "error",
      category: "automation",
      event: "automation_cycle_failed",
      message: error.message || "Automation cycle failed",
      metadata: {},
    });
  }
}