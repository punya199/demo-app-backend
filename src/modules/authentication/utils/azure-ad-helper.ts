import jwt, { SigningKeyCallback } from 'jsonwebtoken'
import jwksClient, { JwksClient } from 'jwks-rsa'

export class AzureAdHelper {
  private client: JwksClient

  constructor(private readonly tenantId: string) {
    this.client = jwksClient({
      jwksUri: `https://login.microsoftonline.com/${this.tenantId}/discovery/keys`,
      cache: true,
      cacheMaxAge: 1000 * 60 * 60 * 1,
    })
  }

  verifyToken(token: string) {
    return new Promise<string | jwt.JwtPayload>((resolve, reject) => {
      jwt.verify(
        token,
        this.getKey(this.client),
        {
          algorithms: ['RS256'],
        },
        (err, decoded) => {
          if (err) {
            reject(err)
          }
          resolve(decoded ?? '')
        }
      )
    })
  }

  private getKey(client: JwksClient) {
    return async (header: jwt.JwtHeader, callback: SigningKeyCallback) => {
      try {
        const key = await client.getSigningKey(header.kid)
        const signingKey = key?.getPublicKey()
        callback(null, signingKey)
      } catch (err) {
        return callback(err)
      }
    }
  }
}
