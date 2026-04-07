import { Issuer, Client } from 'openid-client';
import { ENV } from './env.config';

let keycloakClient: Client;

export const initKeycloak = async (retries = 10, delay = 5000): Promise<Client | undefined> => {
    for (let i = 0; i < retries; i++) {
        try {
            console.log(`Discovering Keycloak issuer at ${ENV.KEYCLOAK.ISSUER_URL} (attempt ${i + 1}/${retries})...`);
            const discoveredIssuer = await Issuer.discover(ENV.KEYCLOAK.ISSUER_URL);
            
            let keycloakIssuer = discoveredIssuer;
            
            // Metadata Cleaning:
            // Sometimes Keycloak returns localhost or internal Docker IPs in its metadata,
            // which breaks browser redirects. We clean these up unconditionally.
            const internalHost = new URL(ENV.KEYCLOAK.ISSUER_URL).host;
            const publicHost = new URL(ENV.KEYCLOAK.PUBLIC_ISSUER_URL).host;
            
            // Clone and rewrite metadata endpoints
            const metadata = { ...discoveredIssuer.metadata };
            
            for (const key in metadata) {
                if (typeof (metadata as any)[key] === 'string') {
                    // Catch various ways Localhost or 127.0.0.1 might appear
                    (metadata as any)[key] = (metadata as any)[key]
                        .replace(/localhost:[0-9]+/g, publicHost)
                        .replace(/127\.0\.0\.1:[0-9]+/g, publicHost)
                        .replace(internalHost, publicHost);
                }
            }
            
            // Ensure the issuer identifier remains the PUBLIC one for token validation
            metadata.issuer = ENV.KEYCLOAK.PUBLIC_ISSUER_URL;
            
            keycloakIssuer = new Issuer(metadata);

            const clientMetadata: any = {
                client_id: ENV.KEYCLOAK.CLIENT_ID,
                redirect_uris: [ENV.KEYCLOAK.REDIRECT_URI, ENV.KEYCLOAK.KEYCLOAK_REDIRECT_URI],
                response_types: ['code'],
                token_endpoint_auth_method: ENV.KEYCLOAK.CLIENT_SECRET ? 'client_secret_basic' : 'none',
            };

            if (ENV.KEYCLOAK.CLIENT_SECRET) {
                clientMetadata.client_secret = ENV.KEYCLOAK.CLIENT_SECRET;
            }

            keycloakClient = new keycloakIssuer.Client(clientMetadata);
            console.log(`Keycloak OpenID Client '${ENV.KEYCLOAK.CLIENT_ID}' initialized successfully`);
            return keycloakClient;
        } catch (error) {
            console.warn(`Failed to discover Keycloak issuer (attempt ${i + 1}/${retries}):`, (error as Error).message);
            if (i === retries - 1) {
                console.error('All attempts to initialize Keycloak failed.');
                throw error;
            }
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
};

export const getKeycloakClient = (): Client => {
    if (!keycloakClient) {
        throw new Error('Keycloak client not initialized yet');
    }
    return keycloakClient;
};
