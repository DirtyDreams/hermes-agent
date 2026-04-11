import { z } from 'zod'

export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
  phone: z.string().min(8).max(20),
  dateOfBirth: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Invalid date format",
  }),
  accountType: z.enum(['MAN', 'WOMAN', 'COUPLE', 'TRANS', 'NON_BINARY']),
  nickname: z.string().min(3).max(30),
  publicKey: z.string(),
})

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
})

export const VerifyPhoneSchema = z.object({
  phone: z.string(),
  code: z.string().length(6),
})

export type RegisterInput = z.infer<typeof RegisterSchema>
export type LoginInput = z.infer<typeof LoginSchema>
export type VerifyPhoneInput = z.infer<typeof VerifyPhoneSchema>
