import { z } from 'zod'

export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(100),
  phone: z.string().min(8).max(20),
  dateOfBirth: z.string().refine((val) => !isNaN(Date.parse(val)), {
    message: "Invalid date format",
  }),
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
