import { BadRequestException, Injectable } from '@nestjs/common';
import { UsersService } from 'src/users/users.service';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { IUser } from 'src/users/users.interface';
import { RegisterUserDto } from 'src/users/dto/create-user.dto';
import { ConfigService } from '@nestjs/config';
import { Response } from 'express';
import ms, { StringValue } from 'ms';
import { RolesService } from 'src/modules/roles/roles.service';
@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    private configService: ConfigService,
    private roleService: RolesService,
  ) {}

  async validateUser(username: string, pass: string): Promise<any> {
    const user = await this.usersService.findOneByUserName(username);
    // console.log(user);
    if (!user) return null;
    const isValid = this.usersService.isValidPassword(pass, user.password);

    if (isValid === true) {
      const userRole = user.role as unknown as { _id: string; name: string };
      // get role
      const temp = await this.roleService.findOne(userRole._id);
      // convert to object and attach permission
      const objUser = {
        ...user.toObject(),
        permissions: temp?.permissions ?? [],
      };
      return objUser;
    }

    return null;
  }
  async login(user: IUser, response: Response) {
    const { _id, name, email, role, permissions, company } = user;
    const payload = {
      sub: 'token login',
      iss: 'from server',
      _id,
      name,
      email,
      role,
      company,
    };
    const refresh_token = this.createRefreshToken(payload);
    //update user with refresh token
    await this.usersService.updateUserToken(refresh_token, _id.toString());
    //set refresh_token as cookies
    const refreshExpire =
      this.configService.get<string>('JWT_REFRESH_EXPIRE') || '7d';

    response.cookie('refresh_token', refresh_token, {
      httpOnly: true,
      secure: false,
      sameSite: 'strict',
      // refreshExpire chắc chắn là string -> ms trả về number
      maxAge: ms(refreshExpire as StringValue),
    });

    return {
      access_token: this.jwtService.sign(payload),
      refresh_token,
      user: {
        _id,
        name,
        email,
        role,
        permissions,
        company,
      },
    };
  }
  async register(registerUserDto: RegisterUserDto) {
    return await this.usersService.register(registerUserDto);
  }
  createRefreshToken = (payload) => {
    const refresh_token = this.jwtService.sign(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_TOKEN_SECRET'),
      expiresIn: this.configService.get<string>(
        'JWT_REFRESH_EXPIRE',
      ) as JwtSignOptions['expiresIn'],
    });
    return refresh_token;
  };

  processNewToken = async (refresh_token: string, response: Response) => {
    try {
      this.jwtService.verify(refresh_token, {
        secret: this.configService.get<string>('JWT_REFRESH_TOKEN_SECRET'),
      });
      //
      const user = await this.usersService.findUserByToken(refresh_token);
      if (user) {
        //update
        const { _id, name, email, role } = user;
        const payload = {
          sub: 'token refresh',
          iss: 'from server',
          _id,
          name,
          email,
          role,
        };
        const new_refresh_token = this.createRefreshToken(payload);
        //update user with refresh token
        await this.usersService.updateUserToken(
          new_refresh_token,
          _id.toString(),
        );
        //fetch role
        const userRole = user.role as unknown as { _id: string; name: string };
        // get role
        const temp = await this.roleService.findOne(userRole._id);
        //set refresh_token as cookies
        response.clearCookie('refresh_token');

        const refreshExpire =
          this.configService.get<string>('JWT_REFRESH_EXPIRE') || '7d';

        response.cookie('refresh_token', refresh_token, {
          httpOnly: true,
          secure: false,
          sameSite: 'strict',
          // refreshExpire chắc chắn là string -> ms trả về number
          maxAge: ms(refreshExpire as StringValue),
        });

        return {
          access_token: this.jwtService.sign(payload),
          refresh_token,
          user: {
            _id,
            name,
            email,
            role,
            permissions: temp?.permissions ?? [],
          },
        };
      }
    } catch (error) {
      throw new BadRequestException(
        `refesh token is not valid, please login again!${error}`,
      );
    }
  };

  handleLogout = async (response: Response, user: IUser) => {
    response.clearCookie('refresh_token');
    await this.usersService.updateUserToken('', user._id.toString());
    return 'ok';
  };
}
