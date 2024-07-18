import { Webhook } from "svix";
import { headers } from "next/headers";
import { clerkClient, WebhookEvent } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createUser } from "@/actions/user.action";

export async function POST(req: Request) {
  try {
    // You can find this in the Clerk Dashboard -> Webhooks -> choose the endpoint
    const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET;

    if (!WEBHOOK_SECRET) {
      console.error("WEBHOOK_SECRET is not defined");
      throw new Error(
        "Please add WEBHOOK_SECRET from Clerk Dashboard to .env or .env.local"
      );
    }

    // Get the headers
    const headerPayload = headers();
    const svix_id = headerPayload.get("svix-id");
    const svix_timestamp = headerPayload.get("svix-timestamp");
    const svix_signature = headerPayload.get("svix-signature");

    // If there are no headers, error out
    if (!svix_id || !svix_timestamp || !svix_signature) {
      console.error("Missing svix headers");
      return new Response("Error occurred -- no svix headers", {
        status: 400,
      });
    }

    // Get the body
    const payload = await req.json();
    const body = JSON.stringify(payload);

    // Log received payload
    console.log("Received payload:", payload);

    // Create a new Svix instance with your secret.
    const wh = new Webhook(WEBHOOK_SECRET);

    let evt: WebhookEvent;

    // Verify the payload with the headers
    try {
      evt = wh.verify(body, {
        "svix-id": svix_id,
        "svix-timestamp": svix_timestamp,
        "svix-signature": svix_signature,
      }) as WebhookEvent;
    } catch (err) {
      console.error("Error verifying webhook:", err);
      return new Response("Error occurred during verification", {
        status: 400,
      });
    }

    // Do something with the payload
    const { id } = evt.data;
    const eventType = evt.type;

    console.log(`Webhook event received: ${eventType} with ID: ${id}`);

    if (eventType === "user.created") {
      const { id, email_addresses, image_url, first_name, last_name, username } = evt.data;

      const user : any = {
        clerkId: id,
        email: email_addresses[0].email_address,
        username: username || "",
        photo: image_url || "",
        firstName: first_name || "",
        lastName: last_name || "",
      };

      console.log("User data to be created:", user);

      try {
        const newUser = await createUser(user);
        console.log("New user created:", newUser);

        if (newUser) {
          await clerkClient.users.updateUserMetadata(id, {
            publicMetadata: {
              userId: newUser.id,
            },
          });
          console.log("Clerk metadata updated");
        }

        return NextResponse.json({ message: "New user created", user: newUser });
      } catch (error) {
        console.error("Error creating user in database:", error);
        return new Response("Internal Server Error", { status: 500 });
      }
    }

    console.log(`Unhandled event type: ${eventType}`);
    return new Response("", { status: 200 });
  } catch (error) {
    console.error("Error handling webhook:", error);
    return new Response("Internal Server Error", { status: 500 });
  }
}
