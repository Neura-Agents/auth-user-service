import { Issuer, Client } from 'openid-client';
import { ENV } from './env.config';

let keycloakClient: Client;

export const initKeycloak = async (retries = 10, delay = 5000): Promise<Client | undefined> => {
    for (let i = 0; i < retries; i++) {
        try {
            console.log(`Discovering Keycloak issuer at ${ENV.KEYCLOAK.ISSUER_URL} (attempt ${i + 1}/${retries})...`);
            const discoveredIssuer = await Issuer.discover(ENV.KEYCLOAK.ISSUER_URL);
            
            let keycloakIssuer = discoveredIssuer;
            
            // Split-Issuer Fix:
            // We discover endpoints via the internal Docker URL, but the browser sees the public localhost URL.
            // If they differ, we create a new Issuer instance that uses the public URL as its identifier 
            // to ensure token validation (iss check) passes.
            if (ENV.KEYCLOAK.ISSUER_URL !== ENV.KEYCLOAK.PUBLIC_ISSUER_URL) {
                const internalHost = new URL(ENV.KEYCLOAK.ISSUER_URL).host;
                const publicHost = new URL(ENV.KEYCLOAK.PUBLIC_ISSUER_URL).host;
                
                // Clone and rewrite metadata endpoints to point back to the internal service
                const metadata = { ...discoveredIssuer.metadata };
                
                // Loop through metadata and replace any variation of localhost with the internal host
                for (const key in metadata) {
                    if (typeof (metadata as any)[key] === 'string') {
                        // Catch both the explicit 8081 port AND the 8080 port that Keycloak defaults to internally
                        (metadata as any)[key] = (metadata as any)[key]
                            .replace(publicHost, internalHost)
                            .replace('localhost:8080', internalHost)
                            .replace('127.0.0.1:8080', internalHost);
                    }
                }
                
                // Ensure the issuer identifier remains the PUBLIC one for token validation
                metadata.issuer = ENV.KEYCLOAK.PUBLIC_ISSUER_URL;
                
                keycloakIssuer = new Issuer(metadata);
            }

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
